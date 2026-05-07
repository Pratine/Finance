import {
  CreditCard, PiggyBank, Wallet, TrendingUp, Building2, Banknote,
  Landmark, CircleDollarSign, Coins, Bitcoin, Home, Car, ShoppingBag,
  Briefcase, Globe, Fuel, ShoppingCart, Pill, UtensilsCrossed, Repeat,
  HeartPulse, Receipt, Plane, MoreHorizontal, ArrowDownLeft, RotateCcw,
  BarChart2, LucideProps,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  CreditCard, PiggyBank, Wallet, TrendingUp, Building2, Banknote,
  Landmark, CircleDollarSign, Coins, Bitcoin, Home, Car, ShoppingBag,
  Briefcase, Globe, Fuel, ShoppingCart, Pill, UtensilsCrossed, Repeat,
  HeartPulse, Receipt, Plane, MoreHorizontal, ArrowDownLeft, RotateCcw,
  BarChart2,
}

interface Props {
  icon: string | null
  size?: number
  className?: string
}

export default function AccountIcon({ icon, size = 16, className }: Props) {
  const Icon = icon ? (ICON_MAP[icon] ?? Wallet) : Wallet
  return <Icon size={size} className={className} />
}
