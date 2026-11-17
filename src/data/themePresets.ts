export type ThemeMode = 'light' | 'dark' | 'system';
export type MediaCardStyle =
  | 'classic'
  | 'minimal'
  | 'expressive'
  | 'material'
  | 'cinematic'
  | 'neon'
  | 'compact'
  | 'editorial'
  | 'wideBanner'
  | 'showcase'
  | 'episodeTile'
  | 'trendingRank'
  | 'shizutv';

export type NavBarStyle =
  | 'classic'
  | 'minimal'
  | 'frosted'
  | 'material'
  | 'docked'
  | 'glassIcons'
  | 'glassLabeled';
export type HeroBannerStyle = 'classic' | 'coverflow' | 'cinematic' | 'splitPoster' | 'minimal';
export type EpisodeChapterStyle = 'classic' | 'grid' | 'box' | 'compact' | 'cover';
export type HomeHeaderStyle =
  | 'classic'
  | 'minimal'
  | 'material'
  | 'prominent'
  | 'docked'
  | 'shizutv'
  | 'clean'
  | 'cleanWave';
export type BackgroundGradientStyle = 'none' | 'topGlow' | 'linear' | 'radial';

export interface ExclusiveSchemeColors {
  primary: string;
  primaryContainer: string;
  secondary: string;
  tertiary: string;
}

export interface ExclusiveSchemeData {
  id: string;
  name: string;
  description: string;
  light: ExclusiveSchemeColors;
  dark: ExclusiveSchemeColors;
}

export const EXCLUSIVE_SCHEMES: ExclusiveSchemeData[] = [
  {
    id: 'shizutv',
    name: 'ShizuTv Amber',
    description: 'Warm ember orange paired with frosted slate-indigo depth',
    light: { primary: '#FF6B00', primaryContainer: '#FFE4CC', secondary: '#F8A036', tertiary: '#6366F1' },
    dark: { primary: '#FF6B00', primaryContainer: '#5A2300', secondary: '#F8A036', tertiary: '#818CF8' },
  },
  {
    id: 'netflix',
    name: 'Netflix',
    description: 'Iconic cinematic red and pitch-black elegance',
    light: { primary: '#E50914', primaryContainer: '#FFD9D9', secondary: '#221F1F', tertiary: '#B81D24' },
    dark: { primary: '#E50914', primaryContainer: '#4D0005', secondary: '#F5F5F1', tertiary: '#FF333A' },
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    description: 'Signature anime orange with sleek obsidian tones',
    light: { primary: '#F47521', primaryContainer: '#FFE8D6', secondary: '#23252B', tertiary: '#FAB818' },
    dark: { primary: '#FF640A', primaryContainer: '#5A2000', secondary: '#FAB818', tertiary: '#FF9E57' },
  },
  {
    id: 'midnight_tokyo',
    name: 'Midnight Tokyo',
    description: 'Neon-lit streets at night',
    light: { primary: '#6C3CE1', primaryContainer: '#E8DEFF', secondary: '#E91E8C', tertiary: '#00BCD4' },
    dark: { primary: '#B794F6', primaryContainer: '#4A1DB8', secondary: '#FF6EC7', tertiary: '#4DD0E1' },
  },
  {
    id: 'arctic_aurora',
    name: 'Arctic Aurora',
    description: 'Northern lights over ice',
    light: { primary: '#0D7C5F', primaryContainer: '#A7F3D0', secondary: '#2563EB', tertiary: '#7C3AED' },
    dark: { primary: '#34D399', primaryContainer: '#065F46', secondary: '#60A5FA', tertiary: '#A78BFA' },
  },
  {
    id: 'sakura_bloom',
    name: 'Sakura Bloom',
    description: 'Cherry blossoms in spring',
    light: { primary: '#DB2777', primaryContainer: '#FCE7F3', secondary: '#F472B6', tertiary: '#BE185D' },
    dark: { primary: '#F9A8D4', primaryContainer: '#9D174D', secondary: '#FBCFE8', tertiary: '#FDA4AF' },
  },
  {
    id: 'volcanic_ember',
    name: 'Volcanic Ember',
    description: 'Lava flowing through obsidian',
    light: { primary: '#DC2626', primaryContainer: '#FEE2E2', secondary: '#EA580C', tertiary: '#CA8A04' },
    dark: { primary: '#FCA5A5', primaryContainer: '#991B1B', secondary: '#FDBA74', tertiary: '#FDE047' },
  },
  {
    id: 'deep_ocean',
    name: 'Deep Ocean',
    description: 'Abyssal depths and bioluminescence',
    light: { primary: '#1E3A5F', primaryContainer: '#D1E5F7', secondary: '#0891B2', tertiary: '#0E7490' },
    dark: { primary: '#7DD3FC', primaryContainer: '#0C4A6E', secondary: '#22D3EE', tertiary: '#67E8F9' },
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    description: 'Warm sunset over the horizon',
    light: { primary: '#B45309', primaryContainer: '#FDE68A', secondary: '#D97706', tertiary: '#92400E' },
    dark: { primary: '#FBBF24', primaryContainer: '#78350F', secondary: '#FCD34D', tertiary: '#F59E0B' },
  },
  {
    id: 'cyber_mint',
    name: 'Cyber Mint',
    description: 'Futuristic mint-green interface',
    light: { primary: '#059669', primaryContainer: '#D1FAE5', secondary: '#0D9488', tertiary: '#14B8A6' },
    dark: { primary: '#6EE7B7', primaryContainer: '#065F46', secondary: '#5EEAD4', tertiary: '#2DD4BF' },
  },
  {
    id: 'lavender_dusk',
    name: 'Lavender Dusk',
    description: 'Twilight purple haze',
    light: { primary: '#7C3AED', primaryContainer: '#EDE9FE', secondary: '#A855F7', tertiary: '#6366F1' },
    dark: { primary: '#C4B5FD', primaryContainer: '#5B21B6', secondary: '#D8B4FE', tertiary: '#A5B4FC' },
  },
  {
    id: 'anime_stream',
    name: 'Animestream',
    description: 'Minimal lime-accent theme from Animestream',
    light: { primary: '#65A30D', primaryContainer: '#EAFCC8', secondary: '#84CC16', tertiary: '#4D7C0F' },
    dark: { primary: '#CAF979', primaryContainer: '#3D4D18', secondary: '#B8E85F', tertiary: '#A7DB4E' },
  },
  {
    id: 'metallic_black',
    name: 'Metallic Black',
    description: 'Metallic blacks with stark, high-contrast silver/cyan accents',
    light: { primary: '#1E1E1E', primaryContainer: '#E0E0E0', secondary: '#424242', tertiary: '#00E5FF' },
    dark: { primary: '#E0E0E0', primaryContainer: '#121212', secondary: '#9E9E9E', tertiary: '#00E5FF' },
  },
  {
    id: 'crimson_forge',
    name: 'Crimson Forge',
    description: 'Rich reds and deep crimsons forged in fire',
    light: { primary: '#B71C1C', primaryContainer: '#FFCDD2', secondary: '#D32F2F', tertiary: '#FF8F00' },
    dark: { primary: '#FF5252', primaryContainer: '#4A0000', secondary: '#FF8A80', tertiary: '#FFB300' },
  },
  {
    id: 'void_walker',
    name: 'Void Walker',
    description: 'Electric light cutting through deep space',
    light: { primary: '#1B2A6B', primaryContainer: '#D4DCFF', secondary: '#0097A7', tertiary: '#6200EA' },
    dark: { primary: '#82B4FF', primaryContainer: '#0D1854', secondary: '#00E5FF', tertiary: '#CE93FF' },
  },
  {
    id: 'blood_moon',
    name: 'Blood Moon',
    description: 'A crimson moon rises over a silent world',
    light: { primary: '#8B0000', primaryContainer: '#FFD6D6', secondary: '#6D1515', tertiary: '#C0392B' },
    dark: { primary: '#FF5252', primaryContainer: '#5C0000', secondary: '#FF8A80', tertiary: '#FFAB40' },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Retro neon highways and endless night drives',
    light: { primary: '#C2185B', primaryContainer: '#FCE4EC', secondary: '#7B1FA2', tertiary: '#0097A7' },
    dark: { primary: '#FF80AB', primaryContainer: '#880E4F', secondary: '#CE93D8', tertiary: '#80DEEA' },
  },
  {
    id: 'phantom',
    name: 'Phantom',
    description: 'Ghost light bleeding through a dark veil',
    light: { primary: '#4527A0', primaryContainer: '#EDE7F6', secondary: '#37474F', tertiary: '#6A1B9A' },
    dark: { primary: '#B39DDB', primaryContainer: '#1A0533', secondary: '#90A4AE', tertiary: '#CE93D8' },
  },
  {
    id: 'toxic',
    name: 'Toxic',
    description: 'Acid green burning through the dark',
    light: { primary: '#33691E', primaryContainer: '#CCFF90', secondary: '#558B2F', tertiary: '#F57F17' },
    dark: { primary: '#B2FF59', primaryContainer: '#1B5E20', secondary: '#CCFF90', tertiary: '#FFD740' },
  },
  {
    id: 'rose_ash',
    name: 'Rose Ash',
    description: 'Faded roses pressed between old pages',
    light: { primary: '#A1616A', primaryContainer: '#F7DDE0', secondary: '#8D6E63', tertiary: '#C48B9F' },
    dark: { primary: '#FFADB6', primaryContainer: '#5C1E27', secondary: '#BCAAA4', tertiary: '#F48FB1' },
  },
  {
    id: 'cobalt_rush',
    name: 'Cobalt Rush',
    description: 'Pure saturated blue at maximum velocity',
    light: { primary: '#1565C0', primaryContainer: '#BBDEFB', secondary: '#0277BD', tertiary: '#00695C' },
    dark: { primary: '#64B5F6', primaryContainer: '#0D3B7A', secondary: '#4FC3F7', tertiary: '#4DB6AC' },
  },
  {
    id: 'jade_palace',
    name: 'Jade Palace',
    description: 'Imperial jade and ancient gold',
    light: { primary: '#00695C', primaryContainer: '#A7FFEB', secondary: '#B8860B', tertiary: '#2E7D32' },
    dark: { primary: '#1DE9B6', primaryContainer: '#003D33', secondary: '#FFD54F', tertiary: '#69F0AE' },
  },
  {
    id: 'solar_punk',
    name: 'Solar Punk',
    description: 'Green cities and amber skies of tomorrow',
    light: { primary: '#558B2F', primaryContainer: '#DCEDC8', secondary: '#F9A825', tertiary: '#00838F' },
    dark: { primary: '#AED581', primaryContainer: '#1B3A0E', secondary: '#FFD54F', tertiary: '#4DD0E1' },
  },
  {
    id: 'abyss',
    name: 'Abyss',
    description: 'The deepest dark, barely a colour remains',
    light: { primary: '#1A237E', primaryContainer: '#C5CAE9', secondary: '#283593', tertiary: '#4527A0' },
    dark: { primary: '#9FA8DA', primaryContainer: '#0D0D1A', secondary: '#7986CB', tertiary: '#B39DDB' },
  },
];

export interface AppThemePreset {
  id: string;
  name: string;
  description: string;
  author: string;
  previewColors: [string, string, string];
  themeMode: ThemeMode;
  exclusiveScheme: string;
  useAmoled: boolean;
  useGradients: boolean;
  gradientStyle: BackgroundGradientStyle;
  gradientIntensity: number;
  useNoiseOverlay: boolean;
  noiseOpacity: number;
  uiRoundness: number;
  cardStyle: MediaCardStyle;
  navBarStyle: NavBarStyle;
  homeHeaderStyle: HomeHeaderStyle;
}

export const BUILT_IN_PRESETS: AppThemePreset[] = [
  {
    id: '1',
    name: 'Blood',
    description: 'Rich blood-red tones, dramatic contrast, and expressive wide content cards.',
    author: '@roshancodespace',
    previewColors: ['#7E1E1E', '#651616', '#5E1616'],
    themeMode: 'dark',
    exclusiveScheme: 'crimson_forge',
    useAmoled: false,
    useGradients: true,
    gradientStyle: 'topGlow',
    gradientIntensity: 0.65,
    useNoiseOverlay: true,
    noiseOpacity: 0.08,
    uiRoundness: 16,
    cardStyle: 'expressive',
    navBarStyle: 'classic',
    homeHeaderStyle: 'prominent',
  },
  {
    id: '2',
    name: 'Frostbite',
    description: 'Icy boreal greens with frosted glass editorial cards.',
    author: '@northpole',
    previewColors: ['#10B981', '#06B6D4', '#047857'],
    themeMode: 'dark',
    exclusiveScheme: 'arctic_aurora',
    useAmoled: false,
    useGradients: true,
    gradientStyle: 'linear',
    gradientIntensity: 0.35,
    useNoiseOverlay: false,
    noiseOpacity: 0.04,
    uiRoundness: 18,
    cardStyle: 'editorial',
    navBarStyle: 'frosted',
    homeHeaderStyle: 'minimal',
  },
  {
    id: '3',
    name: 'Neon Pulse',
    description: 'Vivid neon glow with modern Material You styling.',
    author: '@tokyofuture',
    previewColors: ['#8B5CF6', '#EC4899', '#090A0F'],
    themeMode: 'dark',
    exclusiveScheme: 'midnight_tokyo',
    useAmoled: true,
    useGradients: true,
    gradientStyle: 'radial',
    gradientIntensity: 0.4,
    useNoiseOverlay: false,
    noiseOpacity: 0.04,
    uiRoundness: 16,
    cardStyle: 'material',
    navBarStyle: 'material',
    homeHeaderStyle: 'material',
  },
  {
    id: '4',
    name: 'Sakura Dream',
    description: 'Cherry blossom pink palette with soft tonal seeding.',
    author: '@cherryblossom',
    previewColors: ['#DB2777', '#F472B6', '#FAF3F5'],
    themeMode: 'light',
    exclusiveScheme: 'sakura_bloom',
    useAmoled: false,
    useGradients: true,
    gradientStyle: 'linear',
    gradientIntensity: 0.35,
    useNoiseOverlay: false,
    noiseOpacity: 0.03,
    uiRoundness: 20,
    cardStyle: 'expressive',
    navBarStyle: 'classic',
    homeHeaderStyle: 'classic',
  },
  {
    id: '5',
    name: 'animestream Ultra',
    description: 'Sleek dark lime aesthetics with wide banner cards.',
    author: '@frostnova721',
    previewColors: ['#A3E635', '#3F6212', '#111827'],
    themeMode: 'dark',
    exclusiveScheme: 'anime_stream',
    useAmoled: false,
    useGradients: true,
    gradientStyle: 'topGlow',
    gradientIntensity: 0.3,
    useNoiseOverlay: false,
    noiseOpacity: 0.04,
    uiRoundness: 16,
    cardStyle: 'wideBanner',
    navBarStyle: 'minimal',
    homeHeaderStyle: 'minimal',
  },
];

export const MEDIA_CARD_STYLES: { id: MediaCardStyle; name: string; description: string }[] = [
  { id: 'classic', name: 'Classic', description: 'Balanced poster card with score badge & title' },
  { id: 'minimal', name: 'Minimal', description: 'Clean cover-first card with subtle metadata' },
  { id: 'expressive', name: 'Expressive', description: 'Bold typography & rich gradient scrim' },
  { id: 'material', name: 'Material', description: 'Material You tinted surface container' },
  { id: 'cinematic', name: 'Cinematic', description: 'Wide landscape backdrop card' },
  { id: 'neon', name: 'Neon', description: 'High-contrast edge glow on hover' },
  { id: 'compact', name: 'Compact', description: 'Dense grid-friendly poster layout' },
  { id: 'editorial', name: 'Editorial', description: 'Magazine-inspired typographic framing' },
  { id: 'wideBanner', name: 'Wide Banner', description: 'Full banner spotlight card with synopsis' },
  {
    id: 'showcase',
    name: 'Showcase',
    description: 'Poster card with favorite heart, format/year chips & EP rating row',
  },
  {
    id: 'episodeTile',
    name: 'Episode Tile',
    description: '16:10 landscape card with remove button, format badge, episode & time left',
  },
  {
    id: 'trendingRank',
    name: 'Trending Rank',
    description: 'Landscape backdrop card with rank number, divider, star score & genre',
  },
  {
    id: 'shizutv',
    name: 'ShizuTv',
    description: 'Poster card with frosted format/year pills, heart toggle & ★ score | EP row',
  },
];

export const HERO_BANNER_STYLES: { id: HeroBannerStyle; name: string; description: string }[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Original full-width featured banner with title, genres & Watch CTA',
  },
  {
    id: 'coverflow',
    name: '3D Coverflow',
    description: 'Perspective carousel spotlight with peeking adjacent slides',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Theatrical hero with centered display title, Watch + Details CTAs & progress bars',
  },
  {
    id: 'splitPoster',
    name: 'Poster Spotlight',
    description: 'Blurred backdrop with portrait poster card, rating, synopsis & quick actions',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Compact editorial banner with clean metadata & slide counter',
  },
];

export const EPISODE_CHAPTER_STYLES: {
  id: EpisodeChapterStyle;
  name: string;
  description: string;
}[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Detailed list with faded artwork backdrop & play badge',
  },
  {
    id: 'grid',
    name: 'Grid',
    description: 'Thumbnail grid cards with number & frosted actions',
  },
  {
    id: 'box',
    name: 'Box',
    description: 'Compact numbered boxes for quick episode jumps',
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Clean text rows with episode number & actions',
  },
  {
    id: 'cover',
    name: 'Cover',
    description: 'Wide landscape thumbnail cards with episode details',
  },
];

export const SPLASH_QUOTES: string[] = [
  'Read. Watch. Track.',
  'Curating your next obsession...',
  'Syncing AniList, MAL & Kitsu...',
  'Warming up the stream proxy...',
  'Preparing your anime & manga shelves...',
];
