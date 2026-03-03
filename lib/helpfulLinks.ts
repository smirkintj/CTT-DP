export type HelpfulLinkItem = {
  id: string;
  label: string;
  url: string;
};

export const DEFAULT_HELPFUL_LINKS: HelpfulLinkItem[] = [
  { id: 'uat-guidelines', label: 'UAT Guidelines PDF', url: '#' },
  { id: 'report-bug', label: 'Report a System Bug', url: '#' },
  { id: 'contact-admin', label: 'Contact Admin', url: '#' }
];

export const HELPFUL_LINKS_SETTING_KEY = 'helpful_links';
