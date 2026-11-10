# 🌳 Árbol Genealógico Familiar (HTML + CSS + JavaScript)

Una aplicación web completa, elegante y ligera para visualizar, construir y gestionar tu árbol genealógico familiar, inspirada en la vista de pedigrí/retrato de **FamilySearch** pero con total privacidad, independencia de plataformas de terceros y funcionamiento **100% offline**.

---

## 🚀 Cómo Empezar

No necesitas instalar servidores, dependencias de Node.js ni bases de datos:

1. **Abre `index.html`** directamente con doble clic en tu navegador web favorito (Chrome, Edge, Firefox, Safari, Brave...).
2. La aplicación cargará con el lienzo limpio y un botón para añadir a tu primera persona o cargar tu propio archivo JSON.
3. Empieza a construir tu árbol genealógico fácilmente.

---

## ✨ Características Principales

### 1. Visualización Interactiva (Estilo FamilySearch)
* **Vista Pedigrí (Ascendientes):** Centra una persona y muestra sus ramas familiares hacia atrás (Padres, Abuelos, Bisabuelos...) mediante curvas bezier suaves y tarjetas biográficas.
* **Ranuras para añadir parientes vacíos:** Si falta el padre o la madre de alguien, verás una tarjeta punteada con un botón directo `+ Añadir Padre` o `+ Añadir Madre`.
* **Navegación infinita:** Las flechas `➔` en bisabuelos te permiten avanzar indefinidamente hacia generaciones más lejanas convirtiéndolos en la nueva persona central con un solo clic.
* **Vista de Descendientes:** Muestra la línea de sucesión hacia abajo (hijos, nietos, etc.).
* **Vista Directorio:** Tabla completa con todos los familiares, ordenables y con buscador en tiempo real.
* **Lienzo con Pan & Zoom:** Arrastra el fondo con el ratón o con el dedo en pantallas táctiles, y haz zoom con la rueda del ratón o con los controles `[+]` `[-]` `[⟲]`.

### 2. Editor Visual Integrado en la Web
* **Añadir familiares con relaciones automáticas:**
  * Al hacer clic en `+ Añadir Padre` o `+ Añadir Madre`, el nuevo familiar se enlaza automáticamente a su hijo.
  * Botones rápidos en la ficha de cada persona para añadir Cónyuge o Hijos.
* **Formulario completo de datos:**
  * Nombre, apellidos y género (Hombre, Mujer, Otro).
  * Estado vital (marcar si vive o si ha fallecido).
  * Fecha y lugar de nacimiento; fecha y lugar de defunción.
  * Profesión y notas / anécdotas biográficas.
  * **Fotografías:** Puedes poner la URL de una foto en internet o **subir una imagen desde tu ordenador** (se almacena de forma segura en Base64 dentro del mismo archivo JSON).
* **Ficha biográfica lateral (Drawer):** Haz clic en cualquier familiar para abrir su ficha completa con cálculo automático de edad, lista interactiva de padres, cónyuge, hijos y hermanos.

### 3. Total Control de tus Datos (JSON)
* **Guardado automático local:** Todos tus cambios se guardan al instante en el `localStorage` de tu navegador para que nunca pierdas nada al recargar o cerrar la pestaña.
* **💾 Descargar JSON:** Descarga en cualquier momento tu archivo `.json` de respaldo completo para guardarlo en tu disco duro, nube personal o memoria USB.
* **📂 Cargar JSON:** Selecciona un archivo `.json` guardado previamente o editado a mano para cargarlo en la aplicación.
* **⚙️ Editor de JSON Crudo:** Puedes abrir una ventana modal con el código JSON formateado para inspeccionarlo, copiarlo al portapapeles o pegarle modificaciones directas.

---

## 📄 Estructura del Archivo JSON

El archivo JSON (como el que se incluye de muestra en `data/arbol_ejemplo.json`) tiene una estructura limpia y muy fácil de leer o editar manualmente con cualquier editor de texto (Notepad, VS Code, etc.):

```json
{
  "config": {
    "titulo": "Mi Árbol Genealógico",
    "personaRaizId": "1"
  },
  "personas": [
    {
      "id": "1",
      "nombre": "Gonzalo",
      "apellidos": "García Pérez",
      "genero": "M",
      "fechaNacimiento": "1990-05-14",
      "lugarNacimiento": "Madrid, España",
      "fechaFallecimiento": null,
      "lugarFallecimiento": null,
      "padreId": "2",
      "madreId": "3",
      "parejaId": "4",
      "profesion": "Ingeniero",
      "foto": "",
      "notas": "Notas biográficas..."
    },
    {
      "id": "2",
      "nombre": "Antonio",
      "apellidos": "García López",
      "genero": "M",
      "fechaNacimiento": "1962-08-20",
      "lugarNacimiento": "Toledo, España",
      "fechaFallecimiento": null,
      "lugarFallecimiento": null,
      "padreId": "5",
      "madreId": "6",
      "parejaId": "3",
      "profesion": "Arquitecto",
      "foto": "",
      "notas": ""
    }
  ]
}
```

### Significado de los Campos:
* **`id`**: Identificador único (puede ser un número o texto, ej: `"1"`, `"2"`, `"abuelo_manuel"`).
* **`nombre`**: Nombre de pila.
* **`apellidos`**: Apellidos familiares.
* **`genero`**: `"M"` (Hombre), `"F"` (Mujer), `"X"` (Otro/Desconocido).
* **`fechaNacimiento`**: Fecha en formato `"AAAA-MM-DD"` (ej: `"1962-08-20"`) o solo el año `"1962"`.
* **`lugarNacimiento`**: Ciudad, provincia, país.
* **`fechaFallecimiento`**: `null` si la persona vive, o `"AAAA-MM-DD"` si ha fallecido.
* **`lugarFallecimiento`**: `null` o lugar de defunción.
* **`padreId`**: El `id` de su padre biológico (o `null` si se desconoce).
* **`madreId`**: El `id` de su madre biológica (o `null` si se desconoce).
* **`parejaId`**: El `id` de su cónyuge o pareja (o `null`).
* **`profesion`**: Ocupación u oficio.
* **`foto`**: URL web, ruta local o imagen en Base64 (`data:image/jpeg;base64,...`).
* **`notas`**: Anécdotas, recuerdos o historias familiares.

> **Nota sobre los Hijos y Hermanos:** No hace falta listar manualmente los hijos ni los hermanos en el JSON; la aplicación calcula automáticamente quiénes son los hijos y hermanos de cada persona comparando los `padreId` y `madreId`.

---

## 📁 Estructura del Proyecto

```text
ArbolGenealogico/
├── index.html               # Página web principal
├── css/
│   └── styles.css           # Estilos modernos, responsivos y tarjetas del árbol
├── js/
│   ├── data.js              # Datos de ejemplo iniciales (para funcionamiento offline directo)
│   ├── tree.js              # Motor de cálculo del árbol genealógico y renderizado SVG
│   └── app.js               # Controlador, editor visual, almacenamiento y gestión JSON
├── data/
│   └── arbol_ejemplo.json   # Archivo JSON de muestra independiente
└── README.md                # Documentación del proyecto
```

---

## 🔒 Privacidad y Seguridad

* **Tus datos nunca salen de tu ordenador:** Todo el procesamiento ocurre de forma local en tu navegador.
* No depende de conexiones a internet para funcionar.
* Para crear copias de seguridad de tus datos, pulsa el botón **"💾 Descargar JSON"** y guarda el archivo en tu carpeta preferida.
