//! A minimal Rust library for compiling Typst snippets to PDF.
//!
//! This library provides a simple interface to compile Typst markup into PDF documents
//! without the full CLI overhead. It includes basic font discovery and a minimal world
//! implementation for standalone compilation.
//!
//! # Example
//!
//! ```rust
//! use tokape::TypstCompiler;
//!
//! let compiler = TypstCompiler::new().unwrap();
//! let typst_content = r#"
//! #set page(width: 10cm, height: auto)
//! = Hello, Typst!
//!
//! This is a *simple* document.
//! "#;
//!
//! let pdf_bytes = compiler.compile_to_pdf(typst_content).unwrap();
//! std::fs::write("output.pdf", pdf_bytes).unwrap();
//! ```

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_pdf::PdfOptions;

/// Errors that can occur during compilation
#[derive(Debug, thiserror::Error)]
pub enum CompilationError {
    #[error("Font loading error: {0}")]
    FontError(String),
    #[error("Compilation error: {0}")]
    TypstError(String),
    #[error("PDF generation error: {0}")]
    PdfError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

/// A minimal Typst compiler for converting snippets to PDF
pub struct TypstCompiler {
    world: TypstWorld,
}

impl TypstCompiler {
    /// Create a new compiler instance with basic font discovery
    pub fn new() -> Result<Self, CompilationError> {
        let world = TypstWorld::new()?;
        Ok(Self { world })
    }

    /// Compile a Typst snippet to PDF bytes
    pub fn compile_to_pdf(&self, content: String) -> Result<Vec<u8>, CompilationError> {
        // Create a source from the content
        let source = Source::new(FileId::new(None, VirtualPath::new("main.typ")), content);

        // Update the world with our source
        let mut world = self.world.clone();
        world.set_main_source(source);

        // Compile the document
        let document = typst::compile(&world).output.map_err(|errors| {
            let error_msg = errors
                .into_iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("; ");
            CompilationError::TypstError(error_msg)
        })?;

        // Generate PDF
        let pdf_bytes = typst_pdf::pdf(&document, &PdfOptions::default())
            .map_err(|e| CompilationError::PdfError(format!("PDF generation failed: {e:?}")))?;

        Ok(pdf_bytes)
    }
}

/// A minimal world implementation for Typst compilation
#[derive(Clone)]
struct TypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_source: Option<Source>,
    sources: Arc<Mutex<HashMap<FileId, Source>>>,
}

impl TypstWorld {
    fn new() -> Result<Self, CompilationError> {
        // Create standard library
        let library = LazyHash::new(Library::default());

        // Discover fonts
        let mut fonts = Vec::new();
        let mut book = FontBook::new();

        const FONTS: &[&[u8]] = &[
            include_bytes!("../../fonts/CrimsonText-Bold.ttf"),
            include_bytes!("../../fonts/CrimsonText-BoldItalic.ttf"),
            include_bytes!("../../fonts/CrimsonText-Italic.ttf"),
            include_bytes!("../../fonts/CrimsonText-Regular.ttf"),
            include_bytes!("../../fonts/CrimsonText-SemiBold.ttf"),
            include_bytes!("../../fonts/CrimsonText-SemiBoldItalic.ttf"),
            include_bytes!("../../fonts/Ruposhi Bangla Pr UNI Bold Italic.ttf"),
            include_bytes!("../../fonts/Ruposhi Bangla Pr UNI Bold.ttf"),
            include_bytes!("../../fonts/Ruposhi Bangla Pr UNI Italic.ttf"),
            include_bytes!("../../fonts/Ruposhi Bangla Pr UNI.ttf"),
        ];

        for data in FONTS {
            if let Some(font) = Font::new(Bytes::new(data), 0) {
                book.push(font.info().clone());
                fonts.push(font);
            }
        }

        Ok(Self {
            library,
            book: LazyHash::new(book),
            fonts,
            main_source: None,
            sources: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn set_main_source(&mut self, source: Source) {
        let file_id = source.id();
        self.sources.lock().unwrap().insert(file_id, source.clone());
        self.main_source = Some(source);
    }
}

impl World for TypstWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_source
            .as_ref()
            .map(|s| s.id())
            .expect("Main source not set")
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        self.sources
            .lock()
            .unwrap()
            .get(&id)
            .cloned()
            .ok_or(FileError::NotFound(id.vpath().as_rooted_path().into()))
    }

    fn file(&self, _id: FileId) -> FileResult<Bytes> {
        // For a minimal implementation, we don't support file loading
        // This could be extended to support imports and includes
        Err(FileError::Other(None))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, offset: Option<i64>) -> Option<Datetime> {
        let now = jiff::Zoned::now().with_time_zone(jiff::tz::TimeZone::fixed(jiff::tz::offset(
            offset.unwrap_or(0) as _,
        )));
        Datetime::from_ymd(
            now.year().into(),
            now.month().try_into().ok()?,
            now.day().try_into().ok()?,
        )
    }
}
