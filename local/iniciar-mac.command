#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Necesitas Python 3. Instálalo desde https://www.python.org/downloads/ y vuelve a abrir este lanzador.'
  read -r -p 'Pulsa Intro para cerrar.'
  exit 1
fi
python3 iniciar_actividad.py
