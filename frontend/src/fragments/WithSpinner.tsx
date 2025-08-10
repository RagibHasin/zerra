type Props = { children?: React.ReactNode | null };

export default function WithSpinner({ children }: Props) {
  return (
    <>
      <span className="loading loading-xs loading-spinner" /> {children}
    </>
  );
}
