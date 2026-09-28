/**
 * The linkedin_enrichment columns a VCF export carries and an import accepts.
 * Import payloads come from uploaded files, so this list — not the payload —
 * decides which columns are written. `id` and `contact_id` are deliberately
 * absent: the importing database assigns both.
 */
export const LINKEDIN_ENRICHMENT_COLUMNS = [
  'linkedin_first_name',
  'linkedin_last_name',
  'headline',
  'about',
  'job_title',
  'company_name',
  'company_linkedin_url',
  'industry',
  'country',
  'location',
  'followers_count',
  'education',
  'skills',
  'photo_linkedin',
  'positions',
  'certifications',
  'languages',
  'honors',
  'enriched_at',
  'raw_response'
] as const;
