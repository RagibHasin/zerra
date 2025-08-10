use std::{borrow::Cow, iter};

use crate::{env::I18n, models};

pub(crate) async fn transcribe(
    db: &sqlx::PgPool,
    zerra_id: &str,
    I18n {
        index_format,
        page_number_format,
    }: &I18n,
) -> models::Result<impl axum::response::IntoResponse + use<>> {
    let blob = models::unauthenticated::fetch_blob(db, zerra_id).await?;

    let types::zerra::Zerra {
        title,
        progress,
        flow,
        ..
    } = rmp_serde::from_slice(&blob)?;

    let models::user::User {
        display_name: conductor_name,
        is_male: conductor_is_male,
        ..
    } = models::unauthenticated::owner_of(db, zerra_id).await?;
    let types::zerra::Progress::Finished {
        participant_name, ..
    } = progress
    else {
        unreachable!()
    };

    fn flow_to_array(flow: &[types::zerra::Query]) -> String {
        iter::once(Cow::Borrowed("("))
            .chain(flow.iter().flat_map(query_to_dict).map(Cow::Owned))
            .chain(iter::once(Cow::Borrowed(")")))
            .collect()
    }

    fn query_to_dict(
        types::zerra::Query {
            question,
            revelation,
            answer,
            subflow,
            visible,
            ..
        }: &types::zerra::Query,
    ) -> Option<String> {
        visible.then(move || {
            format!(
                r#"(question: "{question}", answer: "{answer}", revelation: "{revelation}", subflow: {subflow}),"#,
                answer = answer.as_deref().unwrap_or_default(),
                subflow = flow_to_array(subflow),
            )
        })
    }

    let flow_array = flow_to_array(&flow);

    let typst_doc = format!(
        r#"
#let zerra_title = "{title}"

#let conductor_name = "{conductor_name}"
#let attendee_name = "{participant_name}"

#let conductor_is_male = {conductor_is_male}

#let flow = {flow_array}

#let index_format = "{index_format}"
#let page_number_format = "{page_number_format}"

// template begins here

#show heading.where(level: 1): set align(center)
#set page(paper: "a5", numbering: page_number_format)

#let icoMan = box(
  image(
    bytes(
      `<?xml version="1.0" encoding="utf-8"?>
<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
    <path fill="black"
        d="M -12 16 a 12 9 0 0 1 24 0 a 12 13 0 0 1 -24 0 Z M 12 16 a 12 15 0 0 0 -24 0 a 12 19 0 0 0 24 -0 Z"
        transform="translate(18)">
    </path>
</svg>`.text,
    ),
    height: 1em,
  ),
  baseline: 0.125em,
)

#let icoWoman = box(
  image(
    bytes(
      `<?xml version="1.0" encoding="utf-8"?>
<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
    <path fill="black"
        d="M -9 15 a 10.5 10.5 0 0 1 18 0 a 15 15 0 0 1 -18 0 Z M -12 20 a 12 15 0 0 0 24 0 a 12 19 0 0 0 -24 0 Z"
        transform="translate(18)">
    </path>
</svg>`.text,
    ),
    height: 1em,
  ),
  baseline: 0.125em,
)

#let icoConductor = if conductor_is_male {{ icoMan }} else {{ icoWoman }}
#let icoAttendee = if not conductor_is_male {{ icoMan }} else {{ icoWoman }}

#let question_index = counter("question_index")
#let dotty = tiling(size: (2pt, 2pt), relative: "parent", place(dx: 0.25pt, dy: 0.25pt, circle(
  fill: black,
  radius: 0.5pt,
)))

#let defQ(level, question, answer, revelation, others) = [
  #text(weight: "bold")[
    #question_index.step(level: level)
    #context question_index.display(index_format)
    #question
  ]
  #block(stroke: (left: dotty + 1.5pt), inset: (left: 1em), outset: (left: -0.4em), above: 0.75em)[
    #icoAttendee #answer \
    #icoConductor #revelation \

    #others
  ]
]

#let defFlow(level, flow) = {{
  for q in flow {{
    defQ(level, q.question, q.answer, q.revelation, defFlow(level + 1, q.subflow))
  }}
}}

= #zerra_title

#grid(
  columns: (1fr, 2fr, 1fr, 2fr, 1fr),
  [],
  [
    #icoConductor #conductor_name],
  [],
  align(end)[#icoAttendee #attendee_name],
  [],
)

#defFlow(1, flow)
"#
    );
    let compiler = tokape::TypstCompiler::new()?;
    let pdf = compiler.compile_to_pdf(typst_doc)?;

    Ok(axum_extra::response::Attachment::new(pdf).content_type("application/pdf"))
}
