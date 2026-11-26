# Test fixtures

`exemple-projet.qda.md` and `exemple-projet/` are the example project of the qda.md format specification (version 1), as a single file and as a folder. They come from the format repository.

The core tests check that adoq QDA reads them without warnings, writes the single file back byte for byte, splits it into exactly the same folder, and joins the folder back into exactly the same file. These files are compared byte for byte: `.gitattributes` prevents any line-ending conversion.
