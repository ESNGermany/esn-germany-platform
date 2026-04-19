/** biome-ignore-all lint/style/useNamingConvention: <> */

export interface Config {
  id: string;
  name: string;
  email: string;
  cname: string;
  redirects?: string[];
}

export interface WebsiteMainInformation {
  data: {
    section: string;
    website_meta_description: string;
  }[];
}
