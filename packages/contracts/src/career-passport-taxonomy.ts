export const CAREER_PASSPORT_CORE_SECTION_KEYS = [
  'CONTACT_INFORMATION',
  'PROFESSIONAL_SUMMARY',
  'WORK_EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'CERTIFICATIONS',
  'AWARDS',
] as const;

export type CareerPassportCoreSectionKey = (typeof CAREER_PASSPORT_CORE_SECTION_KEYS)[number];

export const CAREER_PASSPORT_EXTENSION_SECTION_KEYS = [
  'PROJECTS',
  'PORTFOLIO',
  'LANGUAGES',
  'INTERESTS',
  'REFERENCES',
  'PROFESSIONAL_LINKS',
  'PUBLICATIONS',
  'VOLUNTEERING',
  'PATENTS',
  'RESEARCH',
  'COURSES',
  'PROFESSIONAL_MEMBERSHIPS',
  'OPEN_SOURCE',
  'SPEAKING_ENGAGEMENTS',
  'TRAINING',
  'HACKATHONS',
  'TEACHING',
  'COMMUNITY_LEADERSHIP',
  'MILITARY_SERVICE',
  'CASE_STUDIES',
  'CLIENTS',
  'MEDIA_COVERAGE',
  'LOCATION_PREFERENCES',
] as const;

export type CareerPassportExtensionSectionKey =
  (typeof CAREER_PASSPORT_EXTENSION_SECTION_KEYS)[number];

export type CareerPassportKnownSectionKey =
  CareerPassportCoreSectionKey | CareerPassportExtensionSectionKey;

export type CareerPassportSectionTypeKey = CareerPassportKnownSectionKey | 'CUSTOM';

export type CareerPassportSectionCategory = 'CORE' | 'EXTENSION' | 'CUSTOM';

export type CareerPassportSectionStorage = 'CORE_TYPED' | 'TYPED_EXTENSION' | 'CUSTOM_SECTION';

export type CareerPassportSectionReviewStatus =
  'AUTO_CLASSIFIED' | 'NEEDS_REVIEW' | 'CANDIDATE_CLASSIFIED';

export interface CareerPassportSectionDefinition {
  key: CareerPassportKnownSectionKey;
  label: string;
  category: Exclude<CareerPassportSectionCategory, 'CUSTOM'>;
  storage: Exclude<CareerPassportSectionStorage, 'CUSTOM_SECTION'> | 'CUSTOM_SECTION';
  aliases: readonly string[];
}

export interface CareerPassportSectionClassification {
  typeKey: CareerPassportSectionTypeKey;
  category: CareerPassportSectionCategory;
  reviewStatus: CareerPassportSectionReviewStatus;
  confidence: number;
  originalHeading: string;
  normalizedHeading: string;
}

export const CAREER_PASSPORT_SECTION_DEFINITIONS: readonly CareerPassportSectionDefinition[] = [
  {
    key: 'CONTACT_INFORMATION',
    label: 'Contact Information',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: ['contact', 'contact information', 'contact details', 'personal details'],
  },
  {
    key: 'PROFESSIONAL_SUMMARY',
    label: 'Professional Summary',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: [
      'summary',
      'professional summary',
      'professional profile',
      'profile',
      'career summary',
      'about me',
    ],
  },
  {
    key: 'WORK_EXPERIENCE',
    label: 'Work Experience',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: [
      'experience',
      'work experience',
      'professional experience',
      'employment',
      'employment history',
      'work history',
      'career history',
    ],
  },
  {
    key: 'EDUCATION',
    label: 'Education',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: ['education', 'academic background', 'academic history', 'qualifications'],
  },
  {
    key: 'SKILLS',
    label: 'Skills',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: ['skills', 'technical skills', 'core skills', 'competencies', 'technologies'],
  },
  {
    key: 'CERTIFICATIONS',
    label: 'Certifications',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: [
      'certifications',
      'certificates',
      'licenses & certifications',
      'licenses and certifications',
      'credentials',
    ],
  },
  {
    key: 'AWARDS',
    label: 'Awards',
    category: 'CORE',
    storage: 'CORE_TYPED',
    aliases: [
      'awards',
      'awards & honors',
      'awards and honors',
      'honors',
      'honours',
      'achievements',
    ],
  },
  {
    key: 'PROJECTS',
    label: 'Projects',
    category: 'EXTENSION',
    storage: 'TYPED_EXTENSION',
    aliases: ['projects', 'selected projects', 'personal projects', 'notable projects'],
  },
  {
    key: 'PORTFOLIO',
    label: 'Portfolio',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['portfolio', 'selected work', 'portfolio work'],
  },
  {
    key: 'LANGUAGES',
    label: 'Languages',
    category: 'EXTENSION',
    storage: 'TYPED_EXTENSION',
    aliases: ['languages', 'language skills'],
  },
  {
    key: 'INTERESTS',
    label: 'Interests',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['interests', 'hobbies', 'hobbies & interests', 'hobbies and interests'],
  },
  {
    key: 'REFERENCES',
    label: 'References',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['references', 'professional references'],
  },
  {
    key: 'PROFESSIONAL_LINKS',
    label: 'Professional Links',
    category: 'EXTENSION',
    storage: 'TYPED_EXTENSION',
    aliases: ['links', 'professional links', 'profiles', 'online profiles', 'social links'],
  },
  {
    key: 'PUBLICATIONS',
    label: 'Publications',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['publications', 'selected publications', 'research publications'],
  },
  {
    key: 'VOLUNTEERING',
    label: 'Volunteering',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['volunteering', 'volunteer experience', 'volunteer work'],
  },
  {
    key: 'PATENTS',
    label: 'Patents',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['patents', 'patents & inventions', 'patents and inventions'],
  },
  {
    key: 'RESEARCH',
    label: 'Research',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['research', 'research experience', 'research interests'],
  },
  {
    key: 'COURSES',
    label: 'Courses',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['courses', 'coursework', 'relevant coursework', 'professional development'],
  },
  {
    key: 'PROFESSIONAL_MEMBERSHIPS',
    label: 'Professional Memberships',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: [
      'professional memberships',
      'memberships',
      'professional affiliations',
      'affiliations',
    ],
  },
  {
    key: 'OPEN_SOURCE',
    label: 'Open Source',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['open source', 'open source contributions', 'oss contributions'],
  },
  {
    key: 'SPEAKING_ENGAGEMENTS',
    label: 'Speaking Engagements',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: [
      'speaking',
      'speaking engagements',
      'talks',
      'conferences & talks',
      'conferences and talks',
    ],
  },
  {
    key: 'TRAINING',
    label: 'Training',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['training', 'professional training'],
  },
  {
    key: 'HACKATHONS',
    label: 'Hackathons',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['hackathons', 'competitions', 'coding competitions'],
  },
  {
    key: 'TEACHING',
    label: 'Teaching',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['teaching', 'teaching experience', 'instruction'],
  },
  {
    key: 'COMMUNITY_LEADERSHIP',
    label: 'Community Leadership',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['community leadership', 'community involvement', 'community service'],
  },
  {
    key: 'MILITARY_SERVICE',
    label: 'Military Service',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['military service', 'military experience'],
  },
  {
    key: 'CASE_STUDIES',
    label: 'Case Studies',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['case studies', 'case study'],
  },
  {
    key: 'CLIENTS',
    label: 'Selected Clients',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['clients', 'selected clients', 'client work'],
  },
  {
    key: 'MEDIA_COVERAGE',
    label: 'Media Coverage',
    category: 'EXTENSION',
    storage: 'CUSTOM_SECTION',
    aliases: ['media coverage', 'media', 'press', 'press coverage'],
  },
  {
    key: 'LOCATION_PREFERENCES',
    label: 'Location Preferences',
    category: 'EXTENSION',
    storage: 'TYPED_EXTENSION',
    aliases: ['location preferences', 'preferred locations'],
  },
] as const;

const ALIAS_TO_DEFINITION = new Map<string, CareerPassportSectionDefinition>();
for (const definition of CAREER_PASSPORT_SECTION_DEFINITIONS) {
  for (const alias of definition.aliases) {
    ALIAS_TO_DEFINITION.set(normalizeCareerSectionHeading(alias), definition);
  }
}

export function normalizeCareerSectionHeading(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getCareerPassportSectionDefinition(
  key: CareerPassportKnownSectionKey,
): CareerPassportSectionDefinition {
  const definition = CAREER_PASSPORT_SECTION_DEFINITIONS.find((item) => item.key === key);
  if (!definition) throw new Error(`Unknown Career Passport section key: ${key}`);
  return definition;
}

export function classifyCareerSectionHeading(heading: string): CareerPassportSectionClassification {
  const normalizedHeading = normalizeCareerSectionHeading(heading);
  const definition = ALIAS_TO_DEFINITION.get(normalizedHeading);

  if (!definition) {
    return {
      typeKey: 'CUSTOM',
      category: 'CUSTOM',
      reviewStatus: 'NEEDS_REVIEW',
      confidence: 0,
      originalHeading: heading.trim(),
      normalizedHeading,
    };
  }

  return {
    typeKey: definition.key,
    category: definition.category,
    reviewStatus: 'AUTO_CLASSIFIED',
    confidence: 1,
    originalHeading: heading.trim(),
    normalizedHeading,
  };
}
