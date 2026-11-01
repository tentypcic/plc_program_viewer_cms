# TIA Openness XML documentation preview

The importer accepts a ZIP of XML exports for one PLC. It preserves relative folder paths and original XML text and creates a new Viewer project. Direct `.ap*` and `.zap*` archives are not supported. Use copy mode to retain existing projects.

The supplied V18 reference was verified locally: eight objects, five wired networks and three empty networks. User files and screenshots are not published. `tests/fixtures/tia` contains an independently authored synthetic conveyor example with five XML objects, two wired networks and one empty network.

## How it works

- The XML parser reads object attributes and namespaced interface sections, recursively expanding nested members and retaining declared types/start values.
- FlgNet `Access` elements provide local/global operands and constants. Array indices and instance symbols are shown.
- `Wire` connects `NameCon` instruction pins, `IdentCon` operands, power rails and open connectors by `UId`.
- Double-click a resolved FC/FB call box (or focus it and press Enter) to open the target XML document in a tab and reveal it in the project tree. Targets are resolved by exact XML name and block type within the current project; missing or ambiguous targets remain inactive.
- Calls use parameter sections to distinguish input/output pins. Open connectors are shown as open; no simulated values are invented.
- SVG layout computes instruction columns from connectivity. Contacts and coils use ladder symbols; SR, TON, ADD and FC/FB calls use pin-labelled boxes. Networks and interfaces collapse independently.
- XML is never inserted as HTML. The importer rejects DTD/entity declarations, malformed XML, traversal paths, excessive ZIP entries and unsupported object roots. Import writes remain transactional.

## Scope and limits

This is a documentation preview, not a TIA runtime, compiler or equivalent editor. It has been validated against the supplied V18 export, not all Siemens versions or instruction libraries. The layout is computed rather than copied from TIA coordinates.

Complex branching, junctions, GRAPH, FBD and vendor instructions need further implementation and reference exports. Basic negated contacts, N contacts, SET/RESET coils and StructuredText token reconstruction are supported; this is not full SCL semantic analysis. Unrecognized instruction boxes are marked generic; unsupported network source languages point to original XML. Do not assume a generic or branched diagram reproduces all execution semantics. UDT declarations are displayed; there is no cross-file type resolver or hardware-symbol resolver.

DB/UDT tables show explicitly exported `StartValue` or `DefaultValue`. When absent, basic Bool, string and numeric type defaults are shown in muted text with a tooltip; these are not live values. Unsupported type defaults remain empty. Retain shows the exported state or an em dash when unspecified. Nested members expand/collapse, and one-dimensional array previews lazily show up to 200 elements. Unconnected pins do not display live timer or numeric values.

## Checks

```sh
npm test
npm run build
npm run test:e2e
npm run test:tia
```

The reference browser script checks rendering and the real workspace, folder toggling without closing a document, reload, dark theme and mobile page overflow. It writes temporary light/dark screenshots to `/tmp` for local visual inspection.

## Cross-reference and network controls

Use **Cross-reference** in a block header to find calls, instance references and symbolic operands in imported XML networks. Enter an exact block/symbol name; a DB name also includes member/array references. `#` locals are scoped to the block from which the dialog was opened. Results show the source block, network and access classification: R, W, R/W or `?` when the instruction/pin is not recognized. Click a result to open and highlight its network.

This index covers imported XML networks only, not PDF, SCL text, hardware references or indirect/runtime accesses. No results means no matches in that available subset, not proof that a variable is unused. Results are limited to 500 displayed entries; invalid XML files are counted as skipped.

**Expand all networks** and **Collapse all networks** affect only the current block's network panels. Interface tables and original XML panels retain their state.

## Larger mixed exports

TIA ZIP import also accepts `.scl` source files, ArrayDB and TechnologicalInstanceDB XML. Source declarations identify FC/FB/OB names and types, and resolved calls can open imported SCL documents. Safety language metadata marks F-blocks. Technology objects show exported interface members, including inherited sections; Motion parameter/configuration editors are not reconstructed.

StructuredText inside a LAD block is rebuilt from tokens, accesses, instructions, blanks, newlines and line comments and shown with lexical highlighting. Cross-reference still indexes FlgNet, not StructuredText or standalone SCL. ArrayDB shows the existing array data preview.

Networks containing branching or generic instructions carry a visible approximation notice. Long parameter names get wider boxes and horizontal scrolling; long labels have a full-name tooltip. The diagram remains a computed documentation layout. It does not execute safety or motion logic.

A private integration check imported 306 XML and six SCL files, preserved all 312 document texts through a portable ZIP roundtrip, opened a mixed LAD/SCL block, and rendered an array DB and inherited technology interface. Private source files and screenshots are not committed. Public regression checks use independent synthetic samples.

## Block interface and address annotations

FC/FB/OB interfaces use a collapsible section tree, including empty exported sections. FB interface rows show exported defaults, Retain, Accessible/Writable/Visible/Setpoint/Supervision flags and localized comments. Missing attributes remain unknown rather than being inferred from the TIA UI.

Calls show `%FCn`/`%FBn` from uniquely resolved XML block metadata. Global FB instances show their imported `%DBn` and symbolic name; multi-instances are not assigned a fabricated DB number. Exact tag names resolve to exported logical addresses such as `%MB1`. No byte/bit offsets are inferred for optimized DB fields. Names with conflicting addresses remain unannotated. InOut pins have a bidirectional marker, and `DeviceStates` places `Ret_Val` on the output side.
