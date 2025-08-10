# tokape

A minimal Rust library for compiling Typst snippets to PDF without the full CLI overhead. Perfect for embedding Typst compilation capabilities into your Rust applications.

## Features

- **Simple API**: Convert Typst markup strings directly to PDF bytes
- **Minimal Dependencies**: Stripped down from typst-cli to essential components only
- **Font Discovery**: Automatic system font detection and loading
- **Error Handling**: Clear error messages for compilation issues
- **Fast**: Leverages Typst's incremental compilation system

## Quick Start

Add this to your `Cargo.toml`:

```toml
[dependencies]
tokape = "0.1.0"
```

Basic usage:

```rust
use tokape::TypstCompiler;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create compiler instance
    let compiler = TypstCompiler::new()?;
    
    // Your Typst content
    let content = r#"
    #set page(width: 10cm, height: auto)
    = Hello, Typst!
    
    This is a *simple* document with some **formatting**.
    
    $ sum_(i=1)^n i = (n(n+1))/2 $
    "#;
    
    // Compile to PDF
    let pdf_bytes = compiler.compile_to_pdf(content)?;
    
    // Save or use the PDF bytes
    std::fs::write("output.pdf", pdf_bytes)?;
    
    Ok(())
}
```

## What's Included

This minimal library includes:

- **Core Typst compiler** (`typst` crate)
- **PDF generation** (`typst-pdf` crate)  
- **Font system** with automatic discovery
- **Basic World implementation** for standalone compilation
- **Error handling** with descriptive messages

## What's Removed

Compared to the full `typst-cli`, this library removes:

- CLI argument parsing and command handling
- File watching and incremental recompilation
- Package management and downloading
- Export to other formats (SVG, PNG, etc.)
- Advanced font configuration options
- Project and workspace management
- Interactive features and diagnostics

## Examples

### Basic Document

```rust
let content = r#"
#set page(margin: 2cm)
#set text(size: 11pt)

= My Report

This is the introduction to my report.

== Section 1

Some content here with *emphasis* and _italics_.
"#;

let pdf = compiler.compile_to_pdf(content)?;
```

### Mathematical Content

```rust
let math_content = r#"
= Mathematical Formulas

The quadratic formula:
$ x = (-b plus.minus sqrt(b^2 - 4a c)) / (2a) $

And the famous equation: $E = m c^2$
"#;

let pdf = compiler.compile_to_pdf(math_content)?;
```

### Structured Document

```rust
let structured_content = r#"
#set heading(numbering: "1.")
#set page(header: align(right)[My Document])

= Introduction

This document demonstrates structured content.

== Subsection

With numbered headings and headers.

=== Sub-subsection

And multiple levels of organization.
"#;

let pdf = compiler.compile_to_pdf(structured_content)?;
```

## Error Handling

The library provides detailed error information:

```rust
match compiler.compile_to_pdf(invalid_content) {
    Ok(pdf) => println!("Success!"),
    Err(tokape::CompilationError::TypstError(msg)) => {
        eprintln!("Typst compilation failed: {}", msg);
    }
    Err(tokape::CompilationError::PdfError(msg)) => {
        eprintln!("PDF generation failed: {}", msg);
    }
    Err(e) => eprintln!("Other error: {}", e),
}
```

## Running Examples

Clone the repository and run the included examples:

```bash
git clone https://github.com/yourusername/tokape
cd tokape
cargo run --example basic_usage
```

This will generate an `example_output.pdf` file demonstrating various Typst features.

## Testing

Run the test suite:

```bash
cargo test
```

The tests include basic compilation, mathematical content, and file output verification.

## Performance

This minimal library is designed for efficiency:

- **Fast startup**: Minimal initialization overhead
- **Memory efficient**: Only loads essential components
- **Incremental**: Benefits from Typst's incremental compilation system
- **Font caching**: System fonts are discovered once and cached

## Limitations

Since this is a minimal implementation:

- **No file imports**: `#include` and `#import` are not supported
- **No package system**: External packages cannot be loaded
- **No custom fonts**: Only system fonts are available
- **No advanced configuration**: Limited customization options

For full Typst functionality, use the official `typst-cli` tool.

## Contributing

Contributions are welcome! Areas for improvement:

- Support for file imports and includes
- Custom font loading
- Additional export formats
- Better error messages
- Performance optimizations

## License

Licensed under either of Apache License, Version 2.0 or MIT license at your option.

## Changelog

### 0.1.0

- Initial release
- Basic Typst to PDF compilation
- System font discovery
- Error handling
- Examples and tests
