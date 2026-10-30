"""Corrige el modelo de embedding CAM++ (WeSpeaker) para ONNX Runtime >= 1.2x.

Problema (2026-10-28): el modelo trae 52 nodos `Pad` que no rellenan nada (pads en
cero) antes de cada `AveragePool` (ceil_mode=1, count_include_pad=0). Desde alguna
version de ONNX Runtime posterior a 1.17.1, el optimizador basico los fusiona en el
`AveragePool` y deja count_include_pad=1, lo que cambia el promedio de la ultima
ventana parcial: los embeddings salen sin relacion con los correctos (coseno ~0.05)
y la diarizacion casi no separa voces. sherpa-onnx >= 1.12.32 trae ORT 1.28.

Arreglo: el modelo se plega con ORT 1.17.1 (nivel basico, solo operadores ONNX
estandar; resuelve los `pads` a constantes) y despues se quitan los `Pad` nulos.
Sin `Pad`, ORT nuevo no tiene nada que fusionar. Las salidas quedan identicas a las
del modelo original sin optimizar (verificado con ORT 1.17.1, 1.23.2 y 1.28.0).

Uso (requiere onnxruntime==1.17.1 y onnx en un entorno aparte):
    python corregir_campplus.py wespeaker_en_voxceleb_CAM++.onnx salida.onnx
"""

import sys

import numpy as np
import onnx
import onnxruntime as ort
from onnx import helper, numpy_helper

ORT_ESPERADO = "1.17.1"


def plegar(origen: str, destino: str) -> None:
    opciones = ort.SessionOptions()
    opciones.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    opciones.optimized_model_filepath = destino
    ort.InferenceSession(origen, opciones, providers=["CPUExecutionProvider"])


def quitar_pads_nulos(modelo: onnx.ModelProto) -> int:
    grafo = modelo.graph
    constantes = {i.name: numpy_helper.to_array(i) for i in grafo.initializer}
    salidas = {o.name for o in grafo.output}
    renombres: dict[str, str] = {}
    conservados = []
    quitados = 0
    for nodo in grafo.node:
        nodo.input[:] = [renombres.get(i, i) for i in nodo.input]
        if nodo.op_type == "Pad":
            atributos = {a.name: helper.get_attribute_value(a) for a in nodo.attribute}
            pads = constantes.get(nodo.input[1]) if len(nodo.input) > 1 else None
            if (
                atributos.get("mode", b"constant") == b"constant"
                and pads is not None
                and not np.any(pads)
                and nodo.output[0] not in salidas
            ):
                renombres[nodo.output[0]] = nodo.input[0]
                quitados += 1
                continue
        conservados.append(nodo)
    del grafo.node[:]
    grafo.node.extend(conservados)
    return quitados


def limpiar_dominios(modelo: onnx.ModelProto) -> None:
    """ORT agrega al guardar dominios que el grafo no usa; se dejan solo los usados."""
    usados = {n.domain for n in modelo.graph.node}
    usados.add("")
    conservar = [o for o in modelo.opset_import if o.domain in usados]
    del modelo.opset_import[:]
    modelo.opset_import.extend(conservar)


def quitar_constantes_huerfanas(modelo: onnx.ModelProto) -> None:
    usadas = {i for n in modelo.graph.node for i in n.input}
    usadas |= {o.name for o in modelo.graph.output}
    conservar = [i for i in modelo.graph.initializer if i.name in usadas]
    del modelo.graph.initializer[:]
    modelo.graph.initializer.extend(conservar)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("uso: corregir_campplus.py ORIGEN.onnx DESTINO.onnx")
    if ort.__version__ != ORT_ESPERADO:
        sys.exit(f"se necesita onnxruntime=={ORT_ESPERADO} (hay {ort.__version__})")
    origen, destino = sys.argv[1], sys.argv[2]
    plegar(origen, destino)
    modelo = onnx.load(destino)
    quitados = quitar_pads_nulos(modelo)
    restantes = sum(1 for n in modelo.graph.node if n.op_type == "Pad")
    if quitados == 0 or restantes:
        sys.exit(f"modelo inesperado: {quitados} Pad nulos, {restantes} Pad con relleno")
    quitar_constantes_huerfanas(modelo)
    limpiar_dominios(modelo)
    onnx.checker.check_model(modelo)
    onnx.save(modelo, destino)
    print(f"Pad nulos quitados: {quitados}")


if __name__ == "__main__":
    main()
