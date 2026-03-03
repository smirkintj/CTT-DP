import MagicLoginClient from './MagicLoginClient';

export default async function MagicLoginPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <MagicLoginClient token={params?.token ?? null} />;
}
