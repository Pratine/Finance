interface Props {
  title: string
}

export default function PlaceholderPage({ title }: Props) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Coming in the next iteration.</p>
    </div>
  )
}
