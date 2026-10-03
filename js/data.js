// All game content & tuning tables. Hidden "truth" lives here (fit, dislikes);
// the player only discovers it by playing.
(function (FG) {
  'use strict';

  const CHANNELS = {
    x:          { id: 'x',          name: 'X / Twitter',      organic: 22, hours: 2, adRate: 0.35, viral: 0.08, community: false, outreach: true },
    linkedin:   { id: 'linkedin',   name: 'LinkedIn',         organic: 20, hours: 2, adRate: 0.14, viral: 0.05, community: false, outreach: true },
    reddit:     { id: 'reddit',     name: 'Reddit',           organic: 36, hours: 2, adRate: 0.4,  viral: 0.1,  community: true },
    tiktok:     { id: 'tiktok',     name: 'TikTok',           organic: 20, hours: 3, adRate: 0.5,  viral: 0.12, community: false },
    instagram:  { id: 'instagram',  name: 'Instagram',        organic: 16, hours: 2, adRate: 0.4,  viral: 0.05, community: false, outreach: true },
    facebook:   { id: 'facebook',   name: 'Facebook Groups',  organic: 28, hours: 2, adRate: 0.45, viral: 0.03, community: true },
    whatsapp:   { id: 'whatsapp',   name: 'WhatsApp Groups',  organic: 14, hours: 1, adRate: 0,    viral: 0.02, community: true, outreach: true },
    hackernews: { id: 'hackernews', name: 'Hacker News',      organic: 30, hours: 2, adRate: 0,    viral: 0.08, community: true },
    youtube:    { id: 'youtube',    name: 'YouTube',          organic: 18, hours: 4, adRate: 0.3,  viral: 0.06, community: false },
    discord:    { id: 'discord',    name: 'Discord',          organic: 18, hours: 2, adRate: 0,    viral: 0.03, community: true },
    email:      { id: 'email',      name: 'Email',            organic: 0,  hours: 2, adRate: 0,    viral: 0,    community: false, outreach: true, nopost: true },
    local:      { id: 'local',      name: 'In person',        organic: 0,  hours: 5, adRate: 0,    viral: 0,    community: false, nopost: true },
  };

  const SEGMENTS = {
    students: {
      id: 'students', name: 'Students', share: 0.17, age: [17, 25], wtp: [1, 7], skep: [0.15, 0.45], color: '#f4b942',
      channels: { tiktok: 0.9, instagram: 0.85, youtube: 0.8, discord: 0.6, reddit: 0.55, whatsapp: 0.6, x: 0.25, email: 0.3, local: 0.25 },
      angles: { pain: 0.3, features: -0.1, story: 0.2, discount: 0.6, humor: 0.7, proof: 0.3, education: 0.4, hype: -0.1 },
      vocab: ['exam', 'study', 'studying', 'procrastination', 'focus', 'focused', 'grades', 'deadline', 'semester', 'class', 'homework', 'notes', 'free', 'cheap', 'student', 'campus', 'finals', 'assignment', 'phone', 'distracted'],
      turnoffs: ['enterprise', 'roi', 'stakeholder', 'b2b', 'synergy'],
      dislikes: { subscriptions: 0.65, corporate: 0.5, long_onboarding: 0.45, ads: 0.25, cold: 0.35, hype: 0.2 },
      bios: ['Juggling 5 classes and a part-time job', 'Lives on group chats and iced coffee', 'Final year, scared of exams', 'Runs a study TikTok on the side', 'Always on their phone, hates it'],
    },
    freelancers: {
      id: 'freelancers', name: 'Freelancers', share: 0.14, age: [23, 45], wtp: [8, 25], skep: [0.3, 0.6], color: '#5ec9a8',
      channels: { linkedin: 0.7, x: 0.6, reddit: 0.5, email: 0.85, youtube: 0.4, discord: 0.3, facebook: 0.3, instagram: 0.3, whatsapp: 0.4, local: 0.2 },
      angles: { pain: 0.7, features: 0.3, story: 0.3, discount: 0.2, humor: 0.1, proof: 0.5, education: 0.5, hype: -0.4 },
      vocab: ['client', 'invoice', 'paid', 'payment', 'late', 'chasing', 'cash', 'cashflow', 'freelance', 'freelancer', 'hours', 'rates', 'contract', 'admin', 'time', 'simple', 'tax', 'projects'],
      turnoffs: ['enterprise', 'team', 'kids', 'students'],
      dislikes: { cold: 0.6, hype: 0.45, ads: 0.35, jargon: 0.35, subscriptions: 0.3, discount: 0.2 },
      bios: ['Designer with 6 clients and 0 admin skills', 'Copywriter, chronically owed money', 'Solo dev, hates paperwork', 'Photographer who invoices from Notes app'],
    },
    smallbiz: {
      id: 'smallbiz', name: 'Shop owners', share: 0.14, age: [28, 60], wtp: [15, 60], skep: [0.35, 0.7], color: '#e07a5f',
      channels: { facebook: 0.85, whatsapp: 0.85, local: 0.65, email: 0.7, instagram: 0.5, linkedin: 0.25, youtube: 0.35 },
      angles: { pain: 0.6, features: 0.2, story: 0.1, discount: 0.5, humor: -0.1, proof: 0.7, education: 0.3, hype: -0.5 },
      vocab: ['shop', 'store', 'customers', 'sales', 'stock', 'inventory', 'business', 'money', 'profit', 'orders', 'staff', 'supplier', 'save', 'simple', 'reliable', 'support', 'sold', 'restock', 'counting'],
      turnoffs: ['startup', 'api', 'beta', 'hustle', 'developer', 'mvp'],
      dislikes: { jargon: 0.6, hype: 0.5, ai_hype: 0.45, cold: 0.35, long_onboarding: 0.4, subscriptions: 0.3 },
      bios: ['Runs a corner provisions shop', 'Owns a small boutique', 'Family pharmacy, 3 staff', 'Sells phone accessories at the market'],
    },
    developers: {
      id: 'developers', name: 'Developers', share: 0.13, age: [20, 45], wtp: [5, 40], skep: [0.45, 0.8], color: '#7b8cde',
      channels: { hackernews: 0.7, reddit: 0.8, x: 0.6, discord: 0.6, youtube: 0.45, email: 0.5, linkedin: 0.2, local: 0.15 },
      angles: { pain: 0.4, features: 0.5, story: 0.6, discount: -0.2, humor: 0.2, proof: 0.2, education: 0.7, hype: -0.8 },
      vocab: ['api', 'open', 'source', 'hosted', 'debug', 'debugging', 'bugs', 'errors', 'error', 'logs', 'latency', 'fast', 'lightweight', 'privacy', 'cli', 'sdk', 'stack', 'deploy', 'production', 'alerts', 'github', 'crash'],
      turnoffs: ['seamless', 'solution', 'leverage', 'ninja', 'rockstar', 'guru'],
      dislikes: { ads: 0.7, hype: 0.75, ai_hype: 0.55, jargon: 0.6, emoji: 0.5, self_promo: 0.6, cold: 0.4 },
      bios: ['Backend engineer, side-project addict', 'Indie hacker with 4 unfinished apps', 'Runs a tiny SaaS at night', 'Open-source maintainer, tired'],
    },
    parents: {
      id: 'parents', name: 'Parents', share: 0.13, age: [27, 48], wtp: [4, 20], skep: [0.3, 0.6], color: '#d38bc8',
      channels: { facebook: 0.85, whatsapp: 0.85, instagram: 0.6, local: 0.5, youtube: 0.4, email: 0.5, tiktok: 0.2 },
      angles: { pain: 0.5, features: 0.0, story: 0.6, discount: 0.3, humor: 0.2, proof: 0.7, education: 0.4, hype: -0.4 },
      vocab: ['kids', 'kid', 'child', 'children', 'bedtime', 'sleep', 'family', 'reading', 'read', 'school', 'safe', 'safety', 'imagination', 'toddler', 'routine', 'learn', 'learning', 'parents', 'stories', 'story'],
      turnoffs: ['hustle', 'grind', 'crypto', 'b2b', 'gains'],
      dislikes: { screen_time: 0.7, ads: 0.4, ai_hype: 0.35, subscriptions: 0.35, hype: 0.3, cold: 0.4 },
      bios: ['Two kids under 6, zero free time', 'Single dad, bedtime is chaos', 'Teacher and mum of three', 'Works nights, misses bedtime'],
    },
    fitness: {
      id: 'fitness', name: 'Gym-goers', share: 0.1, age: [18, 40], wtp: [5, 20], skep: [0.25, 0.55], color: '#9ccf5b',
      channels: { instagram: 0.9, youtube: 0.8, tiktok: 0.7, reddit: 0.5, whatsapp: 0.4, x: 0.2, discord: 0.3, local: 0.3 },
      angles: { pain: 0.3, features: 0.1, story: 0.5, discount: 0.3, humor: 0.3, proof: 0.8, education: 0.5, hype: 0.1 },
      vocab: ['gym', 'workout', 'workouts', 'lift', 'lifting', 'gains', 'strength', 'progress', 'muscle', 'routine', 'plan', 'program', 'reps', 'sets', 'fitness', 'training', 'results', 'consistency', 'plateau'],
      turnoffs: ['enterprise', 'invoice', 'b2b', 'spreadsheet'],
      dislikes: { hype: 0.3, corporate: 0.3, ads: 0.35, subscriptions: 0.4, cold: 0.35 },
      bios: ['Gym 5x a week, stuck at a plateau', 'Just started lifting', 'Powerlifter with a notebook full of numbers', 'Runs a small fitness Instagram'],
    },
    creators: {
      id: 'creators', name: 'Creators', share: 0.1, age: [19, 38], wtp: [8, 35], skep: [0.25, 0.55], color: '#f28ab2',
      channels: { youtube: 0.9, tiktok: 0.8, instagram: 0.85, x: 0.7, discord: 0.5, linkedin: 0.2, email: 0.4 },
      angles: { pain: 0.4, features: 0.1, story: 0.7, discount: 0.1, humor: 0.6, proof: 0.5, education: 0.4, hype: 0.0 },
      vocab: ['audience', 'followers', 'content', 'creator', 'creators', 'grow', 'growth', 'brand', 'monetize', 'sponsors', 'viral', 'editing', 'posting', 'schedule', 'community', 'fans', 'merch'],
      turnoffs: ['enterprise', 'compliance', 'stakeholder'],
      dislikes: { corporate: 0.55, cold: 0.5, hype: 0.25, discount: 0.25, long_onboarding: 0.35, ads: 0.25 },
      bios: ['YouTuber with 12k subs', 'Makes cooking reels', 'Podcaster, 2 episodes a week', 'Illustrator selling prints'],
    },
    professionals: {
      id: 'professionals', name: 'Professionals', share: 0.09, age: [24, 50], wtp: [8, 30], skep: [0.35, 0.65], color: '#6fb3d9',
      channels: { linkedin: 0.9, email: 0.85, x: 0.3, reddit: 0.3, youtube: 0.4, facebook: 0.3 },
      angles: { pain: 0.5, features: 0.4, story: 0.2, discount: 0.0, humor: -0.2, proof: 0.6, education: 0.5, hype: -0.3 },
      vocab: ['career', 'promotion', 'job', 'interview', 'interviews', 'resume', 'cv', 'hired', 'hiring', 'recruiter', 'recruiters', 'salary', 'meetings', 'productivity', 'deep', 'manager', 'linkedin', 'professional', 'offer'],
      turnoffs: ['lol', 'bro', 'vibes', 'hustle'],
      dislikes: { emoji: 0.6, cold: 0.45, discount: 0.35, hype: 0.35, ads: 0.3, subscriptions: 0.2 },
      bios: ['Mid-level analyst eyeing a promotion', 'Job hunting after a layoff', 'Account manager, 30 meetings a week', 'Nurse switching careers'],
    },
  };

  const DISLIKES = {
    cold:            { label: 'Cold, copy-paste messages', quotes: ['Who gave you my email?', 'Another cold DM. Marked as spam.', "I don't reply to copy-paste pitches.", 'Did you even look at my profile?'] },
    ads:             { label: 'Ads', quotes: ['An ad. Scrolled past.', 'I tune out anything that says "Sponsored".', 'Ads make me trust a product less.'] },
    hype:            { label: 'Hype & bold claims', quotes: ['"Revolutionary"? Sure, buddy.', "Every app says it'll change my life.", 'Too good to be true.'] },
    ai_hype:         { label: '"AI-powered" everything', quotes: ['Oh great, another AI wrapper.', 'If you lead with "AI" I assume it\'s half-baked.', "I don't care if it's AI. Does it work?"] },
    jargon:          { label: 'Jargon & buzzwords', quotes: ["I read it twice and still don't know what it does.", '"Seamless solution"... meaning what?', 'Talk to me like a human.'] },
    corporate:       { label: 'Stiff, corporate tone', quotes: ['This reads like a press release.', 'Feels like a committee wrote it.', 'Not my vibe.'] },
    emoji:           { label: 'Emoji / !!! spam', quotes: ['Too many emojis. Skip.', 'Why is this yelling at me!!!', 'Feels spammy.'] },
    self_promo:      { label: 'Self-promo in communities', quotes: ['Drive-by self-promo. Reported.', 'Zero post history, drops a link? Nope.', 'Read the rules before shilling here.'] },
    subscriptions:   { label: 'Yet another subscription', quotes: ['Not another monthly subscription...', "I'm cancelling subscriptions, not adding them.", "I'd buy it once. I won't rent it."] },
    long_onboarding: { label: 'Signing up before trying', quotes: ['Why do I need an account just to look?', 'It wanted my email before showing anything. Closed the tab.'] },
    discount:        { label: 'Discount-driven pitches', quotes: ["If it's always 50% off, what's it really worth?", 'Discounts make it feel cheap.'] },
    screen_time:     { label: 'More screen time for kids', quotes: ['My kids already have too much screen time.', 'Another screen before bed? No.'] },
  };

  const ANGLES = {
    pain:      { name: 'Problem-first',   desc: 'Lead with the pain people feel' },
    features:  { name: 'Feature list',    desc: 'Explain what it does' },
    story:     { name: 'Founder story',   desc: 'Build in public, share the why' },
    discount:  { name: 'Deal / discount', desc: 'Limited-time offer' },
    humor:     { name: 'Humor / meme',    desc: 'Make them laugh first' },
    proof:     { name: 'Social proof',    desc: 'Testimonials & numbers' },
    education: { name: 'Teach something', desc: 'Useful tips, soft sell' },
    hype:      { name: 'Bold claims',     desc: '"The best X ever made"' },
  };

  const PRODUCTS = {
    focusflow: {
      id: 'focusflow', name: 'FocusFlow', icon: 'clock', category: 'Productivity app',
      tagline: 'Pomodoro timer + habit streaks that keep you off your phone.',
      hunch: 'Students & remote workers', difficulty: 2, priceHint: '$3 to $8/mo',
      fit: { students: 0.8, professionals: 0.45, freelancers: 0.45, creators: 0.35, developers: 0.2, fitness: 0.15, parents: 0.1, smallbiz: 0.05 },
      keywords: ['focus', 'procrastination', 'study', 'habit', 'habits', 'streak', 'streaks', 'pomodoro', 'distraction', 'distracted', 'timer', 'phone'],
      features: [
        { id: 'streaks', name: 'Habit streaks', days: 2, appeal: { students: 0.08, fitness: 0.1 } },
        { id: 'blocker', name: 'App & site blocker', days: 3, appeal: { students: 0.12, professionals: 0.12, freelancers: 0.08 } },
        { id: 'rooms', name: 'Virtual study rooms', days: 4, appeal: { students: 0.15, creators: 0.05 } },
        { id: 'reports', name: 'Weekly focus reports', days: 2, appeal: { professionals: 0.12, freelancers: 0.08 } },
        { id: 'aicoach', name: 'AI focus coach', days: 3, ai: true, appeal: { professionals: 0.05, students: 0.04 } },
      ],
    },
    invoicebee: {
      id: 'invoicebee', name: 'InvoiceBee', icon: 'coin', category: 'Fintech tool',
      tagline: 'Send invoices in 30 seconds and auto-chase late payments.',
      hunch: 'Freelancers & small businesses', difficulty: 2, priceHint: '$8 to $20/mo',
      fit: { freelancers: 0.92, creators: 0.5, smallbiz: 0.5, developers: 0.3, professionals: 0.12, students: 0.05, parents: 0.02, fitness: 0.02 },
      keywords: ['invoice', 'invoices', 'invoicing', 'paid', 'payment', 'payments', 'late', 'client', 'clients', 'cash', 'chase', 'reminder', 'reminders'],
      features: [
        { id: 'reminders', name: 'Auto late-payment reminders', days: 2, appeal: { freelancers: 0.1, smallbiz: 0.08 } },
        { id: 'currency', name: 'Multi-currency', days: 2, appeal: { freelancers: 0.08, developers: 0.08 } },
        { id: 'cards', name: 'Card & mobile-money payments', days: 3, appeal: { freelancers: 0.08, creators: 0.12, smallbiz: 0.1 } },
        { id: 'tax', name: 'Tax summary export', days: 3, appeal: { freelancers: 0.08, smallbiz: 0.06 } },
        { id: 'aiwriter', name: 'AI invoice writer', days: 2, ai: true, appeal: { freelancers: 0.02 } },
      ],
    },
    shelfsnap: {
      id: 'shelfsnap', name: 'ShelfSnap', icon: 'box', category: 'Small business tool',
      tagline: 'Count your shop inventory by snapping photos with your phone.',
      hunch: 'Retail shop owners', difficulty: 3, priceHint: '$15 to $49/mo',
      fit: { smallbiz: 0.93, creators: 0.2, freelancers: 0.08, parents: 0.05, developers: 0.05, students: 0.03, professionals: 0.05, fitness: 0.02 },
      keywords: ['stock', 'inventory', 'shop', 'store', 'sales', 'restock', 'sold', 'count', 'counting', 'shelf', 'shelves', 'products'],
      features: [
        { id: 'barcode', name: 'Barcode scanning', days: 3, appeal: { smallbiz: 0.08 } },
        { id: 'lowstock', name: 'Low-stock alerts', days: 2, appeal: { smallbiz: 0.1 } },
        { id: 'whatsapp', name: 'Orders via WhatsApp', days: 3, appeal: { smallbiz: 0.12, creators: 0.08 } },
        { id: 'offline', name: 'Works offline', days: 2, appeal: { smallbiz: 0.1 } },
        { id: 'aiforecast', name: 'AI demand forecast', days: 4, ai: true, appeal: { smallbiz: 0.03 } },
      ],
    },
    loglark: {
      id: 'loglark', name: 'LogLark', icon: 'bug', category: 'Developer tool',
      tagline: 'Lightweight error monitoring for indie devs. One line to install.',
      hunch: 'Developers', difficulty: 3, priceHint: '$9 to $29/mo',
      fit: { developers: 0.93, freelancers: 0.3, creators: 0.03, smallbiz: 0.04, professionals: 0.05, students: 0.08, parents: 0, fitness: 0 },
      keywords: ['error', 'errors', 'bug', 'bugs', 'alert', 'alerts', 'logs', 'crash', 'crashes', 'monitoring', 'debug', 'production', 'stack'],
      features: [
        { id: 'selfhost', name: 'Self-hostable / open source', days: 4, appeal: { developers: 0.12 } },
        { id: 'slack', name: 'Slack & Discord alerts', days: 2, appeal: { developers: 0.06 } },
        { id: 'sdks', name: 'SDKs for 6 languages', days: 4, appeal: { developers: 0.08, freelancers: 0.06 } },
        { id: 'sourcemaps', name: 'Source maps', days: 2, appeal: { developers: 0.05 } },
        { id: 'aitriage', name: 'AI error triage', days: 3, ai: true, appeal: { developers: 0.02 } },
      ],
    },
    storynest: {
      id: 'storynest', name: 'StoryNest', icon: 'moon', category: 'Family app',
      tagline: 'Personalised bedtime stories starring your child.',
      hunch: 'Parents of young kids', difficulty: 2, priceHint: '$4 to $10/mo',
      fit: { parents: 0.93, creators: 0.1, students: 0.03, professionals: 0.05, freelancers: 0.03, smallbiz: 0.02, developers: 0.01, fitness: 0.01 },
      keywords: ['bedtime', 'story', 'stories', 'kids', 'child', 'sleep', 'reading', 'imagination', 'personalised', 'personalized', 'audio'],
      concerns: [{ key: 'screen_time', unless: 'audio' }],
      features: [
        { id: 'audio', name: 'Screen-free audio mode', days: 3, appeal: { parents: 0.08 } },
        { id: 'names', name: "Child's name & friends in stories", days: 2, appeal: { parents: 0.1 } },
        { id: 'langs', name: 'Local languages', days: 3, appeal: { parents: 0.1 } },
        { id: 'offline', name: 'Offline library', days: 2, appeal: { parents: 0.05 } },
        { id: 'aiart', name: 'AI illustrations', days: 3, ai: true, appeal: { parents: 0.02, creators: 0.04 } },
      ],
    },
    cvpolish: {
      id: 'cvpolish', name: 'CVPolish', icon: 'scroll', category: 'Career tool (AI)', isAI: true,
      tagline: 'AI review of your CV and cover letter in 60 seconds.',
      hunch: 'Job seekers', difficulty: 3, priceHint: '$8 to $19/mo or one-time',
      fit: { professionals: 0.78, students: 0.62, freelancers: 0.25, developers: 0.25, creators: 0.1, smallbiz: 0.02, parents: 0.05, fitness: 0.02 },
      keywords: ['resume', 'cv', 'job', 'jobs', 'interview', 'interviews', 'hired', 'career', 'cover', 'letter', 'recruiter', 'application', 'applications'],
      features: [
        { id: 'ats', name: 'Applicant-tracking (ATS) check', days: 2, appeal: { professionals: 0.1, students: 0.08 } },
        { id: 'cover', name: 'Cover letter rewrite', days: 2, appeal: { professionals: 0.08, students: 0.06 } },
        { id: 'linkedin', name: 'LinkedIn profile review', days: 2, appeal: { professionals: 0.08 } },
        { id: 'mock', name: 'Mock interview drills', days: 4, appeal: { students: 0.12, professionals: 0.06 } },
        { id: 'human', name: 'Human reviewer add-on', days: 3, appeal: { professionals: 0.1, students: 0.04 } },
      ],
    },
    liftlog: {
      id: 'liftlog', name: 'LiftLog', icon: 'dumbbell', category: 'Fitness app',
      tagline: 'Workout tracker that tells you exactly what to lift next.',
      hunch: 'Gym-goers', difficulty: 2, priceHint: '$4 to $12/mo',
      fit: { fitness: 0.9, students: 0.3, creators: 0.15, professionals: 0.1, developers: 0.08, freelancers: 0.05, parents: 0.05, smallbiz: 0.02 },
      keywords: ['lift', 'lifting', 'gym', 'workout', 'workouts', 'gains', 'strength', 'progress', 'plateau', 'reps', 'sets', 'tracker', 'program'],
      features: [
        { id: 'progression', name: 'Auto progressive overload', days: 3, appeal: { fitness: 0.1 } },
        { id: 'plates', name: 'Plate calculator', days: 1, appeal: { fitness: 0.04 } },
        { id: 'watch', name: 'Smartwatch sync', days: 3, appeal: { fitness: 0.07 } },
        { id: 'challenges', name: 'Friend challenges', days: 3, appeal: { fitness: 0.08, students: 0.08 } },
        { id: 'aicoach', name: 'AI coach', days: 3, ai: true, appeal: { fitness: 0.03 } },
      ],
    },
  };

  const SCOPES = {
    mvp:      { id: 'mvp',      name: 'Scrappy MVP',     days: 4,  quality: 0.55, bugs: 0.3,  desc: 'Ugly but works. Ship fast, fix later.' },
    v1:       { id: 'v1',       name: 'Solid v1',        days: 9,  quality: 0.72, bugs: 0.14, desc: 'Decent design, few rough edges.' },
    polished: { id: 'polished', name: 'Polished launch', days: 18, quality: 0.86, bugs: 0.05, desc: 'Beautiful and stable. Takes ages.' },
  };

  const MODELS = {
    subscription: { name: 'Monthly subscription', unit: '/mo' },
    onetime:      { name: 'One-time purchase',    unit: ' once' },
    freemium:     { name: 'Free plan + paid upgrade', unit: '/mo' },
  };

  const HYPE_WORDS = ['revolutionary', 'revolutionize', 'game changer', 'game-changer', 'gamechanger', 'disrupt', 'ultimate', 'insane', 'unbelievable', 'world class', 'world-class', '10x', 'guaranteed', 'never before', 'life-changing', 'life changing', 'magic', 'best ever', 'best app', '#1'];
  const JARGON_WORDS = ['synergy', 'leverage', 'seamless', 'robust', 'scalable', 'solution', 'paradigm', 'best-in-class', 'end-to-end', 'holistic', 'empower', 'streamline', 'cutting-edge', 'next-gen', 'innovative', 'ecosystem', 'stakeholder'];
  const AI_WORDS = ['ai', 'a.i', 'gpt', 'chatgpt', 'llm', 'genai', 'artificial intelligence', 'machine learning', 'ai-powered'];

  const VOICES = {
    signup:   ['Signed up for the trial. Let\'s see.', 'Okay, this is exactly my problem. Trying it.', 'Signed up. Curious.', 'Finally someone gets it. Starting the trial.'],
    free:     ['Made a free account. Poking around.', 'Using the free plan for now.'],
    waitlist: ['Joined the waitlist. Ping me when it\'s live.', 'Put my email down. Curious.', 'Waitlisted!'],
    paid:     ['Just paid. Worth it.', 'Upgraded. This saves me real time.', 'Take my money.', 'Paid! Don\'t you dare shut this down.'],
    lowfit:   ['Neat, but not a problem I have.', 'Cool idea. Not for me.', 'Who is this for?', 'Why would I need this?'],
    meh:      ['Scrolled past.', 'Saw it. Didn\'t click.', 'Maybe later.', 'Hmm. Not sure.', 'Didn\'t grab me.'],
    fatigue:  ['I keep seeing this everywhere...', 'Again? Okay, I get it.'],
    noproof:  ['No users, no reviews. Is this even real?', '"Loved by thousands"? I can\'t find one review.'],
    bounce:   ['Checked the site. Wasn\'t convinced.', 'Landing page didn\'t tell me enough.', 'Opened it, closed it.'],
    account:  ['Wanted to try it, but it demanded an account first. Closed the tab.'],
    bug:      ['It crashed twice. Uninstalled.', 'Lost my data after an update. Done.', 'Too buggy for daily use.'],
    trialEnd: ['Trial ended. Not paying for it.', 'Liked it, but not enough to pay.', 'Forgot I even signed up.'],
  };

  const BUILD_LOG = ['Set up the repo and picked a stack', 'Fought with authentication for 6 hours', 'Designed the onboarding flow', 'Rewrote what you wrote on day 2', 'Fixed a bug that only happens on Tuesdays', 'Wired up payments', 'Wrote the landing page copy', 'Tested on a very old Android phone', 'Deployed to production. It broke.', 'Deployed to production. It worked!', 'Renamed every variable. Felt productive.', 'Drew the logo in MS Paint'];

  const FIRST_NAMES = ['Ama', 'Kwame', 'Akosua', 'Kofi', 'Efua', 'Yaw', 'Abena', 'Kojo', 'Esi', 'Kwesi', 'Adwoa', 'Nana', 'Chidi', 'Ngozi', 'Tunde', 'Amara', 'Zainab', 'Musa', 'Fatima', 'Ibrahim', 'Maya', 'Leo', 'Sofia', 'Liam', 'Aisha', 'Omar', 'Priya', 'Arjun', 'Mei', 'Kenji', 'Lucia', 'Mateo', 'Hana', 'Noah', 'Zara', 'Eli', 'Ines', 'Diego', 'Yara', 'Sam', 'Ruth', 'Jonah', 'Grace', 'Felix', 'Nia', 'Tomas', 'Lina', 'Ravi', 'Chloe', 'Malik', 'Wanjiru', 'Thabo', 'Lerato', 'Sipho', 'Selam', 'Dawit', 'Ana', 'Pedro', 'Elif', 'Can', 'Freya', 'Ola', 'Mia', 'Ben'];
  const LAST_INITIALS = 'ABCDEFGHJKLMNOPRSTWY'.split('');

  // Town map locations: what you can do in each building.
  const PLACES = [
    { id: 'garage',   name: 'Your Garage',     sub: 'Build, price & support', actions: ['improve', 'pricing', 'onboard', 'referral'], roof: '#c0563f', wall: '#e8d5b0', icon: 'wrench' },
    { id: 'cafe',     name: 'The Cafe',        sub: 'Talk to real people',    actions: ['interview'], roof: '#8a5a3c', wall: '#f0e2c8', icon: 'cup' },
    { id: 'library',  name: 'Library',         sub: 'Write content & SEO',    actions: ['content'], roof: '#5a6b8c', wall: '#d9d4c7', icon: 'book' },
    { id: 'postoffice', name: 'Post Office',   sub: 'Email & DM outreach',    actions: ['outreach'], roof: '#c4473a', wall: '#e9e3d3', icon: 'mail' },
    { id: 'adagency', name: 'Ad Agency',       sub: 'Buy paid ads',           actions: ['ads'], roof: '#d4a12a', wall: '#2f3542', icon: 'coin' },
    { id: 'square',   name: 'Town Square',     sub: 'Host a meetup / demo',   actions: ['event'], roof: '#6a994e', wall: '#e8e1cf', icon: 'flag' },
    { id: 'launchpad', name: 'Launch Pad',     sub: 'Product Hunt launch',    actions: ['launch_ph'], roof: '#da552f', wall: '#f3e6d8', icon: 'rocket' },
    { id: 'x',        name: 'Bird Tower',      sub: 'X / Twitter',            channel: 'x', actions: ['post', 'engage'], roof: '#22272e', wall: '#cfd8e3', icon: 'bird' },
    { id: 'linkedin', name: 'Office Tower',    sub: 'LinkedIn',               channel: 'linkedin', actions: ['post', 'engage'], roof: '#0a66c2', wall: '#dfe8f1', icon: 'tie' },
    { id: 'reddit',   name: 'Forum Tavern',    sub: 'Reddit',                 channel: 'reddit', actions: ['post', 'engage'], roof: '#ff4500', wall: '#f1e0cf', icon: 'alien' },
    { id: 'tiktok',   name: 'Dance Hall',      sub: 'TikTok',                 channel: 'tiktok', actions: ['post', 'engage'], roof: '#25f4ee', wall: '#2b2b2b', icon: 'note' },
    { id: 'instagram', name: 'Photo Gallery',  sub: 'Instagram',              channel: 'instagram', actions: ['post', 'engage'], roof: '#c13584', wall: '#f6e1ea', icon: 'camera' },
    { id: 'facebook', name: 'Community Hall',  sub: 'Facebook Groups',        channel: 'facebook', actions: ['post', 'engage'], roof: '#1877f2', wall: '#e4ebf5', icon: 'people' },
    { id: 'whatsapp', name: 'Chat Kiosk',      sub: 'WhatsApp Groups',        channel: 'whatsapp', actions: ['post', 'engage'], roof: '#25d366', wall: '#e5f5e9', icon: 'bubble' },
    { id: 'hackernews', name: 'Hacker Den',    sub: 'Hacker News',            channel: 'hackernews', actions: ['post', 'engage', 'launch_hn'], roof: '#ff6600', wall: '#f6f0e0', icon: 'y' },
    { id: 'youtube',  name: 'Cinema',          sub: 'YouTube',                channel: 'youtube', actions: ['post', 'engage'], roof: '#e62117', wall: '#f2e0de', icon: 'play' },
    { id: 'discord',  name: 'Arcade',          sub: 'Discord servers',        channel: 'discord', actions: ['post', 'engage'], roof: '#5865f2', wall: '#e3e5fb', icon: 'gamepad' },
  ];

  const BADGES = [
    { max: 18, id: 'gold', name: 'Market Whisperer', color: '#f4c430' },
    { max: 28, id: 'silver', name: 'Growth Hacker', color: '#c9d1d9' },
    { max: 45, id: 'bronze', name: 'Scrappy Founder', color: '#cd7f32' },
    { max: Infinity, id: 'iron', name: 'First Dollar', color: '#8b9bb4' },
  ];

  FG.data = { CHANNELS, SEGMENTS, DISLIKES, ANGLES, PRODUCTS, SCOPES, MODELS, HYPE_WORDS, JARGON_WORDS, AI_WORDS, VOICES, BUILD_LOG, FIRST_NAMES, LAST_INITIALS, PLACES, BADGES };
})((globalThis.FG = globalThis.FG || {}));
