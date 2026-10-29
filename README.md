# Walpatt

Aplicación responsive para organizar Pokémon de Pokémon GO y sus disfraces. Incluye landing page, registro e inicio de sesión, listas 100 IV y shiny, listas personalizadas, búsqueda por nombre y filtro por región.

## Arquitectura

- Interfaz estática HTML, CSS y JavaScript.
- Funciones serverless Node.js en `api/`, ejecutadas localmente con Vercel CLI y desplegadas en Vercel.
- MongoDB Atlas guarda cuentas y colecciones por usuario.
- Las cuentas se registran con nombre de usuario único (no distingue mayúsculas), correo y contraseña. El inicio de sesión se hace con el nombre de usuario y la contraseña.
- Las contraseñas se guardan con scrypt. La sesión usa una cookie firmada, `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- `data/pokemon.json` contiene las 1.025 especies y sus formas predeterminadas; `data/pokemon-forms.json` añade 561 formas alternativas con identificador, región, disponibilidad e imagen propia; `data/costumes.json` contiene 307 disfraces.
- El catálogo de formas se generó con los datos públicos de PokéAPI y añade manualmente los nueve patrones de Spinda de Pokémon GO. Las formas indicadas como disponibles en GO están activadas; el resto se conserva con `available: false` y `shinyAvailable: false` para incorporarlas en el futuro.
- La sesión iniciada muestra el nombre de usuario y los controles de cuenta; las cuentas sin sesión solo ven la landing. En móvil, las listas se abren en un panel lateral.
- Cada lista incluye filtros para ver todos, los marcados o los pendientes. Las listas personalizadas se pueden editar y borrar; las predefinidas 100 IV y Shiny no se borran.
- El perfil permite cambiar usuario, correo y contraseña. El apartado Amigos permite buscar usuarios, enviar y responder solicitudes, y consultar solo las listas marcadas como públicas de amistades aceptadas.

## Ejecutar en local

Requiere Node.js 22 o superior y una cuenta/base de datos de MongoDB Atlas. También necesitas iniciar sesión en Vercel CLI la primera vez.

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y configura `MONGODB_URI` y `SESSION_SECRET`. El archivo `.env.local` está excluido de Git.
3. Inicia el servidor de Vercel:

   ```bash
   npx vercel login
   npm run dev
   ```

   Abre la URL local que indique Vercel CLI. No abras `index.html` directamente: las cuentas y las API requieren un servidor.

## Publicar en GitHub y Vercel

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta. Comprueba que `.env.local` no aparece entre los archivos preparados para subir.
2. En Vercel, importa el repositorio. Vercel detecta las funciones de `api/`; no hace falta configurar un comando de build.
3. En **Project → Settings → Environment Variables**, añade `MONGODB_URI` y `SESSION_SECRET` para Production y, si quieres, Preview y Development. Usa los valores de tu `.env.local`.
4. En MongoDB Atlas, añade la IP de salida de Vercel en **Network Access**. Para una configuración inicial puede usarse `0.0.0.0/0` y restringir el usuario de base de datos a los permisos necesarios; Atlas exige una regla de acceso para aceptar conexiones desde Vercel.
5. Guarda las variables y vuelve a desplegar.

`SESSION_SECRET` debe ser una cadena aleatoria de al menos 32 caracteres. Puedes generar una con `openssl rand -base64 48`. Define un secreto distinto para cada entorno y no lo publiques.

## Datos y catálogo

- `available: false` excluye un Pokémon o disfraz de las listas.
- `shinyAvailable: false` lo excluye de las listas que tienen activado el filtro shiny.
- `data/events.json` define los eventos que aparecen en la sección Eventos. Cada evento tiene `id`, `name`, `description` (opcional), fechas opcionales `startDate`/`endDate` y `sources`, un array de grupos de obtención. Cada grupo incluye `id`, `name` y `pokemonIds`: IDs de `data/pokemon.json`, `data/pokemon-forms.json` o `data/costumes.json`. Usa números para Pokémon base y cadenas para formas (`form-...`) y disfraces (`costume-...`). El mismo ID puede aparecer en más de un grupo; el total pendiente del evento lo cuenta una sola vez. La web compara esos IDs con todo lo que la persona ha marcado en cualquiera de sus listas.

  ```json
  [
    {
      "id": "evento-ejemplo",
      "name": "Nombre del evento",
      "description": "Descripción opcional",
      "startDate": "2026-10-01",
      "endDate": "2026-10-07",
      "sources": [
        { "id": "salvajes", "name": "Salvajes", "pokemonIds": [25, "form-10028", "costume-1-2"] },
        { "id": "incursiones", "name": "Incursiones", "pokemonIds": [25, 150] }
      ]
    }
  ]
  ```
- El progreso de cada cuenta se guarda en la colección `collections`; las cuentas están en `users`; las solicitudes y amistades aceptadas están en `friendships`.
- Las imágenes requieren internet. Las especies y sus formas usan sprites de [PokeAPI](https://github.com/PokeAPI/sprites); todos los patrones de Spinda usan su sprite genérico. En listas shiny, Pokémon y disfraces cambian automáticamente a su ruta shiny según su proveedor de imágenes. Los disfraces usan fuentes de Pogo data y Pokéxperto; si falta una imagen, la tarjeta muestra el sprite de la especie en la variante correspondiente a la lista.

## Seguridad de credenciales

No subas `.env.local` ni pegues credenciales en el repositorio. Si la contraseña del usuario de MongoDB se compartió en un canal que no sea privado, cámbiala en Atlas y actualiza `MONGODB_URI` tanto localmente como en las variables de Vercel antes de publicar.
