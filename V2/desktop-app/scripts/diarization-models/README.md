# Modelos de diarización

Herramienta de mantenimiento, fuera de la app. La app solo descarga los `.onnx` ya
publicados en el release `modelos-diarizacion-v1`. Cada uno tiene su SHA-256
fijado en `src-tauri/src/diarization_model.rs`.

## Embedding CAM++ corregido (`corregir_campplus.py`)

El modelo `wespeaker_en_voxceleb_CAM++.onnx` (CC BY 4.0, WeSpeaker/VoxCeleb) trae
52 nodos `Pad` que no rellenan nada. Cada uno está antes de un `AveragePool` con
`ceil_mode=1` y `count_include_pad=0`.

ONNX Runtime 1.28 es el que trae sherpa-onnx 2.0.1. Su optimizador básico fusiona
esos `Pad` en el pooling y deja `count_include_pad=1`, así que la última ventana
parcial se promedia mal. El resultado: embeddings sin relación con los correctos
(coseno ~0.05) y una diarización que casi no separa voces. ORT 1.17.1, el de
sherpa-onnx 1.12.9, no hace esa fusión.

El script hace tres cosas:

1. Pliega el modelo con ORT 1.17.1, solo con operadores ONNX estándar.
2. Quita los `Pad` nulos.
3. Valida el resultado con `onnx.checker`.

Las salidas del modelo corregido son idénticas a las del original sin optimizar.
Se verificó con ORT 1.17.1, 1.23.2 y 1.28.0 y con ocho duraciones de entrada. El
script es determinista: dos corridas dan el mismo archivo.

```bash
python -m venv .venv-ort117
.venv-ort117/Scripts/python -m pip install "onnxruntime==1.17.1" "numpy<2" "onnx<1.17"
.venv-ort117/Scripts/python corregir_campplus.py wespeaker_en_voxceleb_CAM++.onnx wespeaker_en_voxceleb_CAM++_sin-pad.onnx
```

| Archivo | SHA-256 | Bytes |
|---|---|---|
| Original (`wespeaker_en_voxceleb_CAM++.onnx`) | `c46fad10b5f81e1aa4a60c162714208577093655076c5450f8c469e522ec54ef` | 29 292 684 |
| Corregido (`wespeaker_en_voxceleb_CAM++_sin-pad.onnx`) | `9cd3461587dc294b76cace34f89700e67148f6143518e70d28c24643af587e54` | 29 202 006 |

La licencia CC BY 4.0 permite la adaptación, pero pide atribución y que se indique
el cambio. Al subir el corregido al release, `LICENCIAS.md` debe decir que es una
versión modificada (`Pad` nulos quitados) y enlazar este script.
