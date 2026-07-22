# ZoliQua odontogram SVG templates

Vendored from [ZoliQua/React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul)
at commit `3375edf52f888416127223211120d349451ab82f`.

Only the four facial templates used by the optional MiDoc visual skin are
included: `11.svg`, `13.svg`, `14.svg`, and `16.svg`. MiDoc keeps its own
clickable surface geometry, state model, and payload; these files are a
non-interactive presentation layer.

The vendored copies add one local CSS rule that hides the source chart's bone,
gum, and healthy-pulp layers. This keeps the optional skin focused on the tooth
silhouette and avoids making healthy pulp look like a recorded endodontic
finding. Geometry and the remaining source artwork are unchanged.

Copyright (c) 2026 Zoltán Dul. Distributed under the MIT License; see
`LICENSE` in this directory.
