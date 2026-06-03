# Control de equipamiento

Web móvil para la Sociedad Bomberos Voluntarios Pergamino.

## Qué hace

- Lee la agenda desde Google Sheets.
- Muestra las actividades del día según la hoja `AGENDA`.
- Permite ver todas las actividades cargadas.
- Genera un formulario automático por cada hoja de actividad.
- Agrupa los elementos por `Ubicación` y los ordena por `Orden de ubicación`.
- Permite descargar PDF desde el celular o computadora.
- Guarda el PDF en Drive, creando una carpeta por actividad.
- Registra novedades en la hoja `NOVEDADES`.
- Envía todos los días a las 23 h un resumen acumulado de novedades.

## Estructura esperada del Google Sheets

### Hoja `AGENDA`

| Día | Actividad 1 | Actividad 2 | Actividad 3 | Actividad 4 |
|---|---|---|---|---|
| Lunes | M12 | M3 | | |
| Martes | M12 | | | |

El nombre de cada actividad debe coincidir exactamente con el nombre de la hoja.

### Hojas de actividad

Ejemplo: hoja `M3`, hoja `M12`, etc.

| Móvil | Orden de ubicación | Ubicación | Elemento | Cantidad |
|---|---:|---|---|---:|
| Móvil 3 | 1 | 1. Vía aérea | Sonda de aspiración | 10 |

## Configuración de Apps Script

1. Abrir el Google Sheets.
2. Ir a `Extensiones` > `Apps Script`.
3. Crear un archivo y pegar el contenido de `apps-script.gs`.
4. Guardar el proyecto.
5. Ejecutar una vez la función `createDailyTrigger` y aceptar permisos.
6. Ir a `Implementar` > `Nueva implementación`.
7. Tipo: `Aplicación web`.
8. Ejecutar como: `Yo`.
9. Quién tiene acceso: según necesidad institucional. Para GitHub Pages suele funcionar con `Cualquier usuario con el enlace`.
10. Copiar la URL de la aplicación web.

## Configuración del repo

1. Abrir `app.js`.
2. Reemplazar:

```js
const WEB_APP_URL = 'PEGAR_URL_WEB_APP_DE_APPS_SCRIPT';
```

por la URL de la aplicación web de Apps Script.

## Publicar en GitHub Pages

1. Crear un repo llamado `Control-de-equipamiento` o similar.
2. Subir estos archivos:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `logo-sbvp.png`
   - `README.md`
3. En GitHub ir a `Settings` > `Pages`.
4. Source: `Deploy from a branch`.
5. Branch: `main` / carpeta `/root`.
6. Guardar.

## Datos ya configurados en Apps Script

- Google Sheets ID: `1iej80w--kZK_N33UTq9FbDbA0air3qFimrDIB1QAxZ0`
- Carpeta Drive ID: `12CkVpy0YE0Jais2ffn1ewbKAvLR0USsQ`
- Mail novedades: `adm.equipamiento.sbvp@gmail.com`
- Institución: `Sociedad Bomberos Voluntarios Pergamino`


## Actualización incluida

- Responsable/s se carga desde la columna D de la primera hoja del Google Sheets de personal.
- El campo Responsable permite buscar con lupa y seleccionar varias personas.
- Se reemplazó Guardia/Turno por Fecha, autocompletada con la fecha actual y editable.
- El formulario tiene un único botón final: Descargar + Enviar.
- Al enviar, guarda el PDF en Drive y descarga una copia local.


## Actualización v3

- Las actividades de hoy muestran una tilde a la derecha cuando ya tienen un registro cargado con fecha de hoy.
- El formulario ahora muestra, por cada ubicación, una tabla con columnas separadas:
  - Elemento
  - Unidades
  - Cantidad
  - Condición
- El PDF de Drive y el PDF descargable también separan Elemento y Unidades.
- Para que el listado de responsables funcione hay que actualizar también el Apps Script y volver a implementar la Web App.


## Actualización v4

- Se actualizó la URL del Apps Script:
  https://script.google.com/macros/s/AKfycbzYiO560Az_Eo_hPzAxeczftZG4h9M3SEPjm-ACtrKzfdtHj_CRiqCCenM3KkIy6vyx/exec
- La vista móvil conserva la tabla como tabla, con una fila por elemento.
- Cada ubicación mantiene sus columnas: Elemento, Unidades, Cantidad y Condición.
- La lista de responsables se toma desde:
  1nTBEnVuyXHPMJsMrnfdfcbKUFIFLKED3Z4oalQYRH14
