import { redirect } from 'next/navigation';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Preserve UTM parameters and other query params when redirecting
  const params = new URLSearchParams();
  const resolvedParams = await searchParams;

  Object.entries(resolvedParams).forEach(([key, value]) => {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.append(key, value);
      }
    }
  });

  const queryString = params.toString();
  const redirectUrl = queryString ? `/login?${queryString}` : '/login';

  redirect(redirectUrl);
}
