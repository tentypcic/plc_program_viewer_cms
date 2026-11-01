# TIA Openness XML documentation preview

The importer accepts a ZIP of XML exports for one PLC. It preserves relative folder paths and original XML text and creates a new Viewer project. Direct `.ap*` and `.zap*` archives are not supported. Use copy mode to retain existing projects.

The supplied V18 reference was verified locally: eight objects, five wired networks and three empty networks. User files and screenshots are not published. `tests/fixtures/tia` contains an independently authored synthetic conveyor example with five XML objects, two wired networks and one empty network.

## How it works

- The XML parser reads object attributes and namespaced interface sections, recursively expanding nested members and retaining declared types/start values.
- FlgNet `Access` elements provide local/global operands and constants. Array indices and instance symbols are shown.
- `Wire` connects `NameCon` instruction pins, `IdentCon` operands, power rails and open connectors by `UId`.
- Calls use parameter sections to distinguish input/output pins. Open connectors are shown as open; no simulated values are invented.
- SVG layout computes instruction columns from connectivity. Contacts and coils use ladder symbols; SR, TON, ADD and FC/FB calls use pin-labelled boxes. Networks and interfaces collapse independently.
- XML is never inserted as HTML. The importer rejects DTD/entity declarations, malformed XML, traversal paths, excessive ZIP entries and unsupported object roots. Import writes remain transactional.

## Scope and limits

This is a documentation preview, not a TIA runtime, compiler or equivalent editor. It has been validated against the supplied V18 export, not all Siemens versions or instruction libraries. The layout is computed rather than copied from TIA coordinates.

Complex branching, junctions, negation variants, GRAPH, FBD, SCL network XML and vendor instructions need further implementation and reference exports. Unrecognized instruction boxes are marked generic; unsupported network source languages point to original XML. Do not assume a generic or branched diagram reproduces all execution semantics. UDT declarations are displayed; there is no cross-file type resolver or hardware-symbol resolver.

Start-value cells show explicitly exported `StartValue` values. Empty cells do not imply a particular runtime/default value. Unconnected pins do not display live timer or numeric values.

## Checks

```sh
npm test
npm run build
npm run test:e2e
npm run test:tia
```

The reference browser script checks rendering and the real workspace, folder toggling without closing a document, reload, dark theme and mobile page overflow. It writes temporary light/dark screenshots to `/tmp` for local visual inspection.
