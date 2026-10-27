# Pokélist

Aplicación responsive para organizar Pokémon de Pokémon GO y sus disfraces. Incluye landing page, registro e inicio de sesión, listas 100 IV y shiny, listas personalizadas, búsqueda por nombre y filtro por región.

## Arquitectura

- Interfaz estática HTML, CSS y JavaScript.
- Funciones serverless Node.js en `api/`, ejecutadas localmente con Vercel CLI y desplegadas en Vercel.
- MongoDB Atlas guarda cuentas y colecciones por usuario.
- Las cuentas se registran con nombre de usuario único (no distingue mayúsculas), correo y contraseña. El inicio de sesión se hace con el nombre de usuario y la contraseña.
- Las contraseñas se guardan con scrypt. La sesión usa una cookie firmada, `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- `data/pokemon.json` contiene 1.025 especies; `data/costumes.json`, 307 disfraces.

## Ejecutar en local

Requiere Node.js 20 o superior y una cuenta/base de datos de MongoDB Atlas.

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y configura `MONGODB_URI` y `SESSION_SECRET`. El archivo `.env.local` está excluido de Git.
3. Inicia el servidor de Vercel:

   ```bash
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
- El progreso de cada cuenta se guarda en la colección `collections`; las cuentas están en `users`.
- Las imágenes requieren internet. Las especies usan sprites de PokeAPI y los disfraces usan el espejo público de imágenes de Pogo data; si falta una imagen de disfraz, la tarjeta muestra el sprite normal de esa especie.

## Seguridad de credenciales

No subas `.env.local` ni pegues credenciales en el repositorio. Si la contraseña del usuario de MongoDB se compartió en un canal que no sea privado, cámbiala en Atlas y actualiza `MONGODB_URI` tanto localmente como en las variables de Vercel antes de publicar.
