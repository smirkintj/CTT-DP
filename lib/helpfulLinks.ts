export type HelpfulLinkItem = {
  id: string;
  label: string;
  url: string;
};

export function getHelpfulLinksKey(productId: string): string {
  return `helpful_links:${productId}`;
}
