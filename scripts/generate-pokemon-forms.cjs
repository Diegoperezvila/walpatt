// Builds data/pokemon-forms.json from the PokeAPI CSV exports.
// Required files: pokemon.csv, pokemon_forms.csv, pokemon_form_names.csv.
// Usage: POKEAPI_DATA_DIR=<folder> node scripts/generate-pokemon-forms.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const input = process.env.POKEAPI_DATA_DIR || process.env.TEMP || process.env.TMP;

function csv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift();
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

const loadCsv = (name) => csv(fs.readFileSync(path.join(input, name), 'utf8'));
const pokemonRows = loadCsv('pokemon.csv');
const formRows = loadCsv('pokemon_forms.csv');
const formNameRows = loadCsv('pokemon_form_names.csv');
const pokemonById = new Map(pokemonRows.map((item) => [Number(item.id), item]));
const defaultBySpecies = new Map(pokemonRows.filter((item) => item.is_default === '1').map((item) => [Number(item.species_id), item]));
const localFormNames = new Map(formNameRows.filter((item) => item.local_language_id === '7').map((item) => [Number(item.pokemon_form_id), item.form_name]));
const catalogPath = path.join(root, 'data', 'pokemon.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const catalogById = new Map(catalog.map((item) => [Number(item.id), item]));

const current = new Set(`
castform-sunny castform-rainy castform-snowy burmy-sandy burmy-trash wormadam-sandy wormadam-trash
cherrim-sunshine necrozma-dusk necrozma-dawn deoxys-attack deoxys-defense deoxys-speed
rotom-heat rotom-wash rotom-frost rotom-fan rotom-mow giratina-origin dialga-origin palkia-origin
shaymin-sky deerling-summer deerling-autumn deerling-winter sawsbuck-summer sawsbuck-autumn sawsbuck-winter
tornadus-therian thundurus-therian landorus-therian enamorus-therian kyurem-black kyurem-white keldeo-resolute
genesect-douse genesect-shock genesect-burn genesect-chill furfrou-heart furfrou-star furfrou-diamond
furfrou-debutante furfrou-matron furfrou-dandy furfrou-la-reine furfrou-kabuki furfrou-pharaoh hoopa-unbound
oricorio-pom-pom oricorio-pau oricorio-sensu shellos-east gastrodon-east basculin-blue-striped basculin-white-striped
flabebe-yellow flabebe-orange flabebe-blue flabebe-white floette-yellow floette-orange floette-blue floette-white
florges-yellow florges-orange florges-blue florges-white pumpkaboo-small pumpkaboo-large pumpkaboo-super
gourgeist-small gourgeist-large gourgeist-super lycanroc-midnight lycanroc-dusk toxtricity-low-key
sinistea-antique polteageist-antique maushold-family-of-three squawkabilly-blue-plumage
squawkabilly-yellow-plumage squawkabilly-white-plumage tatsugiri-droopy tatsugiri-stretchy
dudunsparce-three-segment poltchageist-artisan sinistcha-masterpiece
rattata-alola raticate-alola raichu-alola sandshrew-alola sandslash-alola vulpix-alola ninetales-alola
diglett-alola dugtrio-alola meowth-alola persian-alola geodude-alola graveler-alola golem-alola
grimer-alola muk-alola exeggutor-alola marowak-alola meowth-galar ponyta-galar rapidash-galar
slowpoke-galar slowbro-galar farfetchd-galar weezing-galar mr-mime-galar articuno-galar zapdos-galar
moltres-galar slowking-galar corsola-galar zigzagoon-galar linoone-galar darumaka-galar
darmanitan-galar-standard darmanitan-galar-zen yamask-galar stunfisk-galar growlithe-hisui
arcanine-hisui voltorb-hisui electrode-hisui typhlosion-hisui qwilfish-hisui sneasel-hisui
samurott-hisui lilligant-hisui zorua-hisui zoroark-hisui braviary-hisui sliggoo-hisui
goodra-hisui avalugg-hisui decidueye-hisui tauros-paldea-combat-breed tauros-paldea-blaze-breed
tauros-paldea-aqua-breed wooper-paldea meowstic-female indeedee-female basculegion-female
oinkologne-female unfezant-female frillish-female jellicent-female pyroar-female
`.trim().split(/\s+/));
for (const letter of 'bcdefghijklmnopqrstuvwxyz') current.add(`unown-${letter}`);
current.add('unown-exclamation'); current.add('unown-question');

const labels = {
  'castform-sunny':'Soleado', 'castform-rainy':'Lluvia', 'castform-snowy':'Nieve',
  'burmy-plant':'Tronco planta', 'burmy-sandy':'Tronco arena', 'burmy-trash':'Tronco basura',
  'wormadam-plant':'Tronco planta', 'wormadam-sandy':'Tronco arena', 'wormadam-trash':'Tronco basura',
  'cherrim-overcast':'Encapotado', 'cherrim-sunshine':'Soleado',
  'necrozma-dusk':'Melena crepuscular', 'necrozma-dawn':'Alas del alba', 'necrozma-ultra':'Ultra',
  'deoxys-normal':'Normal', 'deoxys-attack':'Ataque', 'deoxys-defense':'Defensa', 'deoxys-speed':'Velocidad',
  'rotom':'Normal', 'rotom-heat':'Calor', 'rotom-wash':'Lavado', 'rotom-frost':'Frío', 'rotom-fan':'Ventilador', 'rotom-mow':'Corte',
  'giratina-altered':'Modificada', 'giratina-origin':'Origen', 'dialga':'Normal', 'dialga-origin':'Origen',
  'palkia':'Normal', 'palkia-origin':'Origen', 'shaymin-land':'Tierra', 'shaymin-sky':'Cielo',
  'deerling-spring':'Primavera', 'deerling-summer':'Verano', 'deerling-autumn':'Otoño', 'deerling-winter':'Invierno',
  'sawsbuck-spring':'Primavera', 'sawsbuck-summer':'Verano', 'sawsbuck-autumn':'Otoño', 'sawsbuck-winter':'Invierno',
  'tornadus-incarnate':'Avatar', 'thundurus-incarnate':'Avatar', 'landorus-incarnate':'Avatar', 'enamorus-incarnate':'Avatar',
  'tornadus-therian':'Tótem', 'thundurus-therian':'Tótem', 'landorus-therian':'Tótem', 'enamorus-therian':'Tótem',
  'kyurem':'Normal', 'kyurem-black':'Negro', 'kyurem-white':'Blanco', 'keldeo-ordinary':'Habitual', 'keldeo-resolute':'Brío',
  'genesect':'Normal', 'genesect-douse':'HidroROM', 'genesect-shock':'FulgoROM', 'genesect-burn':'PiroROM', 'genesect-chill':'CrioROM',
  'furfrou-natural':'Normal', 'furfrou-heart':'Corazón', 'furfrou-star':'Estrella', 'furfrou-diamond':'Rombo',
  'furfrou-debutante':'Señorita', 'furfrou-matron':'Dama', 'furfrou-dandy':'Caballero', 'furfrou-la-reine':'Aristocrático',
  'furfrou-kabuki':'Kabuki', 'furfrou-pharaoh':'Faraónico', 'hoopa':'Contenido', 'hoopa-unbound':'Desatado',
  'oricorio-baile':'Estilo apasionado', 'oricorio-pom-pom':'Estilo animado', 'oricorio-pau':'Estilo plácido', 'oricorio-sensu':'Estilo refinado',
  'unown-a':'A', 'unown-exclamation':'!', 'unown-question':'?', 'spinda-pattern-1':'Patrón 1', 'spinda-pattern-2':'Patrón 2',
  'spinda-pattern-3':'Patrón 3', 'spinda-pattern-4':'Patrón 4', 'spinda-pattern-5':'Patrón 5', 'spinda-pattern-6':'Patrón 6',
  'spinda-pattern-7':'Patrón 7', 'spinda-pattern-8':'Patrón 8', 'spinda-pattern-9':'Patrón 9',
  'shellos-west':'Oeste', 'shellos-east':'Este', 'gastrodon-west':'Oeste', 'gastrodon-east':'Este',
  'basculin-red-striped':'Raya roja', 'basculin-blue-striped':'Raya azul', 'basculin-white-striped':'Raya blanca',
  'flabebe-red':'Flor roja', 'flabebe-yellow':'Flor amarilla', 'flabebe-orange':'Flor naranja', 'flabebe-blue':'Flor azul', 'flabebe-white':'Flor blanca',
  'floette-red':'Flor roja', 'floette-yellow':'Flor amarilla', 'floette-orange':'Flor naranja', 'floette-blue':'Flor azul', 'floette-white':'Flor blanca', 'floette-eternal':'Flor eterna',
  'florges-red':'Flor roja', 'florges-yellow':'Flor amarilla', 'florges-orange':'Flor naranja', 'florges-blue':'Flor azul', 'florges-white':'Flor blanca',
  'pumpkaboo-small':'Pequeño', 'pumpkaboo-average':'Normal', 'pumpkaboo-large':'Grande', 'pumpkaboo-super':'Extragrande',
  'gourgeist-small':'Pequeño', 'gourgeist-average':'Normal', 'gourgeist-large':'Grande', 'gourgeist-super':'Extragrande',
  'lycanroc-midday':'Diurno', 'lycanroc-midnight':'Nocturno', 'lycanroc-dusk':'Crepuscular', 'toxtricity-amped':'Forma aguda', 'toxtricity-low-key':'Forma grave',
  'sinistea-phony':'Falsificada', 'sinistea-antique':'Genuina', 'polteageist-phony':'Falsificada', 'polteageist-antique':'Genuina',
  'maushold-family-of-three':'Familia de 3', 'maushold-family-of-four':'Familia de 4',
  'squawkabilly-green-plumage':'Verde', 'squawkabilly-blue-plumage':'Azul', 'squawkabilly-yellow-plumage':'Amarillo', 'squawkabilly-white-plumage':'Blanco',
  'tatsugiri-curly':'Curvada', 'tatsugiri-droopy':'Lánguida', 'tatsugiri-stretchy':'Recta',
  'dudunsparce-two-segment':'Binodular', 'dudunsparce-three-segment':'Trinodular',
  'poltchageist-counterfeit':'Fraudulenta', 'poltchageist-artisan':'Opulenta', 'sinistcha-unremarkable':'Mediocre', 'sinistcha-masterpiece':'Exquisita',
  'rattata-alola':'Alola', 'raticate-alola':'Alola', 'raichu-alola':'Alola', 'sandshrew-alola':'Alola', 'sandslash-alola':'Alola',
  'vulpix-alola':'Alola', 'ninetales-alola':'Alola', 'diglett-alola':'Alola', 'dugtrio-alola':'Alola', 'meowth-alola':'Alola',
  'persian-alola':'Alola', 'geodude-alola':'Alola', 'graveler-alola':'Alola', 'golem-alola':'Alola', 'grimer-alola':'Alola',
  'muk-alola':'Alola', 'exeggutor-alola':'Alola', 'marowak-alola':'Alola',
  'meowth-galar':'Galar', 'ponyta-galar':'Galar', 'rapidash-galar':'Galar', 'slowpoke-galar':'Galar', 'slowbro-galar':'Galar',
  'farfetchd-galar':'Galar', 'weezing-galar':'Galar', 'mr-mime-galar':'Galar', 'articuno-galar':'Galar', 'zapdos-galar':'Galar',
  'moltres-galar':'Galar', 'slowking-galar':'Galar', 'corsola-galar':'Galar', 'zigzagoon-galar':'Galar', 'linoone-galar':'Galar',
  'darumaka-galar':'Galar', 'darmanitan-galar-standard':'Galar', 'darmanitan-galar-zen':'Galar', 'yamask-galar':'Galar', 'stunfisk-galar':'Galar',
  'growlithe-hisui':'Hisui', 'arcanine-hisui':'Hisui', 'voltorb-hisui':'Hisui', 'electrode-hisui':'Hisui', 'typhlosion-hisui':'Hisui',
  'qwilfish-hisui':'Hisui', 'sneasel-hisui':'Hisui', 'samurott-hisui':'Hisui', 'lilligant-hisui':'Hisui', 'zorua-hisui':'Hisui',
  'zoroark-hisui':'Hisui', 'braviary-hisui':'Hisui', 'sliggoo-hisui':'Hisui', 'goodra-hisui':'Hisui', 'avalugg-hisui':'Hisui', 'decidueye-hisui':'Hisui',
  'tauros-paldea-combat-breed':'Combatiente (Paldea)', 'tauros-paldea-blaze-breed':'Ardiente (Paldea)',
  'tauros-paldea-aqua-breed':'Acuática (Paldea)', 'wooper-paldea':'Paldea',
  'meowstic-male':'Macho', 'meowstic-female':'Hembra', 'indeedee-male':'Macho', 'indeedee-female':'Hembra',
  'basculegion-male':'Macho', 'basculegion-female':'Hembra', 'oinkologne-male':'Macho', 'oinkologne-female':'Hembra',
  'unfezant-male':'Macho', 'unfezant-female':'Hembra', 'frillish-male':'Macho', 'frillish-female':'Hembra',
  'jellicent-male':'Macho', 'jellicent-female':'Hembra', 'pyroar-male':'Macho', 'pyroar-female':'Hembra'
};

function translatedLabel(form) {
  if (labels[form.identifier]) return labels[form.identifier];
  const localized = (localFormNames.get(Number(form.id)) || '').trim();
  if (localized) return localized.replace(/^(forma de|forma|modo|tipo)\s+/i, '').trim();
  const suffix = form.form_identifier || form.identifier.split('-').slice(1).join('-') || 'normal';
  return suffix.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formImage(form, speciesId) {
  const pokemonId = Number(form.pokemon_id);
  if (pokemonId !== Number(speciesId)) return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`;
  const suffix = form.form_identifier || form.identifier.split('-').slice(1).join('-');
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}-${suffix}.png`;
}

const variants = [];
const seen = new Set();
const formsBySpecies = new Map();
for (const form of formRows) {
  const entity = pokemonById.get(Number(form.pokemon_id));
  if (!entity) continue;
  const speciesId = Number(entity.species_id);
  // Mothim has one form; PokeAPI carries duplicate Burmy-like form records.
  if (speciesId === 414) continue;
  const basePokemon = defaultBySpecies.get(speciesId);
  const base = catalogById.get(speciesId);
  if (!basePokemon || !base || (form.is_default === '1' && Number(form.pokemon_id) === Number(basePokemon.id))) continue;
  if (seen.has(form.identifier)) continue;
  seen.add(form.identifier);
  const label = translatedLabel(form);
  const regional = form.identifier.match(/-(alola|galar|hisui|paldea)(?:-|$)/)?.[1];
  const region = regional ? regional[0].toUpperCase() + regional.slice(1) : base.region;
  const available = current.has(form.identifier);
  const speciesName = base.pokemonName || base.name.split(' · ')[0];
  const variant = {
    id: `form-${form.id}`,
    pokemonId: speciesId,
    pokemonName: speciesName,
    formName: label,
    formIdentifier: form.identifier,
    name: `${speciesName} · ${label}`,
    region,
    available,
    shinyAvailable: available ? !!base.shinyAvailable : false,
    image: formImage(form, speciesId)
  };
  variants.push(variant);
  if (!formsBySpecies.has(speciesId)) formsBySpecies.set(speciesId, []);
  formsBySpecies.get(speciesId).push(form);
}

// Label the existing base record as its actual default form, keeping its original numeric ID.
const defaultLabels = {
  201:'A',
  19:'Kanto',20:'Kanto',26:'Kanto',27:'Kanto',28:'Kanto',37:'Kanto',38:'Kanto',50:'Kanto',51:'Kanto',
  52:'Kanto',53:'Kanto',58:'Kanto',59:'Kanto',74:'Kanto',75:'Kanto',76:'Kanto',77:'Kanto',78:'Kanto',79:'Kanto',
  80:'Kanto',83:'Kanto',88:'Kanto',89:'Kanto',100:'Kanto',101:'Kanto',103:'Kanto',105:'Kanto',110:'Kanto',
  122:'Kanto',128:'Kanto',144:'Kanto',145:'Kanto',146:'Kanto',157:'Kanto',194:'Johto',199:'Johto',211:'Johto',
  215:'Johto',222:'Johto',263:'Hoenn',264:'Hoenn',351:'Normal',386:'Normal',412:'Tronco planta',413:'Tronco planta',
  421:'Encapotado',422:'Oeste',423:'Oeste',479:'Normal',483:'Normal',484:'Normal',487:'Modificada',492:'Tierra',
  493:'Normal',550:'Raya roja',555:'Normal',585:'Primavera',586:'Primavera',592:'Macho',593:'Macho',
  641:'Avatar',642:'Avatar',645:'Avatar',646:'Normal',647:'Habitual',649:'Normal',666:'Motivo pradera',
  668:'Macho',669:'Flor roja',670:'Flor roja',671:'Flor roja',676:'Normal',678:'Macho',710:'Normal',711:'Normal',
  718:'50%',720:'Contenido',741:'Estilo apasionado',745:'Diurno',774:'Meteorito',800:'Normal',849:'Forma aguda',854:'Falsificada',
  855:'Falsificada',876:'Macho',902:'Macho',905:'Avatar',916:'Macho',925:'Familia de 4',931:'Verde',978:'Curvada',
  982:'Binodular',1012:'Fraudulenta',1013:'Mediocre'
};
for (const [speciesId, base] of catalogById) {
  if (!formsBySpecies.has(speciesId)) continue;
  const label = defaultLabels[speciesId];
  if (!label) continue;
  base.pokemonName = base.pokemonName || base.name.split(' · ')[0];
  base.formName = label;
  base.formIdentifier = 'default';
  base.name = `${base.pokemonName} · ${label}`;
}

const spinda = catalogById.get(327);
if (spinda) {
  spinda.pokemonName = spinda.pokemonName || spinda.name.split(' · ')[0];
  spinda.formName = 'Patrón 1';
  spinda.formIdentifier = 'pattern-1';
  spinda.name = `${spinda.pokemonName} · Patrón 1`;
  spinda.image = 'https://www.p337.info/pokemongo/pages/img/spinda_1n.png';
  for (let number = 1; number <= 9; number++) {
    if (number === 1) continue;
    variants.push({
      id: `form-spinda-pattern-${number}`,
      pokemonId: 327,
      pokemonName: 'Spinda',
      formName: `Patrón ${number}`,
      formIdentifier: `spinda-pattern-${number}`,
      name: `Spinda · Patrón ${number}`,
      region: spinda.region,
      available: true,
      shinyAvailable: ![4, 9].includes(number),
      image: `https://www.p337.info/pokemongo/pages/img/spinda_${number}n.png`
    });
  }
}

// Unfezant's sex difference is not represented as a separate PokeAPI form resource.
if (!seen.has('unfezant-female') && catalogById.has(521)) {
  const base = catalogById.get(521);
  base.pokemonName = base.pokemonName || base.name.split(' · ')[0];
  base.formName = 'Macho';
  base.formIdentifier = 'male';
  base.name = `${base.pokemonName} · Macho`;
  variants.push({
    id: 'form-unfezant-female', pokemonId: 521, pokemonName: 'Unfezant', formName: 'Hembra',
    formIdentifier: 'unfezant-female', name: 'Unfezant · Hembra', region: base.region,
    available: true, shinyAvailable: !!base.shinyAvailable,
    image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/521-female.png'
  });
}

variants.sort((a, b) => a.pokemonId - b.pokemonId || a.name.localeCompare(b.name, 'es'));
// Persist default-form labels alongside the alternate-form catalog so every
// species has a distinct, named form entry in the app.
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'data', 'pokemon-forms.json'), `${JSON.stringify(variants, null, 2)}\n`, 'utf8');
console.log(`Generadas ${variants.length} formas en data/pokemon-forms.json.`);
