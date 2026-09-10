import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BasketDetail } from "@/components/basket-detail";
import { baskets, getBasket } from "@/lib/baskets";

type BasketPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return baskets.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: BasketPageProps): Promise<Metadata> {
  const { slug } = await params;
  const basket = getBasket(slug);
  return basket ? { title: basket.name, description: basket.description } : {};
}

export default async function BasketPage({ params }: BasketPageProps) {
  const { slug } = await params;
  const basket = getBasket(slug);
  if (!basket) notFound();

  return <AppShell><BasketDetail basket={basket} /></AppShell>;
}
