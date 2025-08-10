type Props = { children?: React.ReactNode | null };

export default function Message({ children }: Props) {
  return children != null ?
      <div className="p-4 pb-2 text-center text-sm tracking-wide opacity-60">{children}</div>
    : null;
}
