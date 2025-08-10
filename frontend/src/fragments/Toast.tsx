import * as icons from '@heroicons/react/24/outline';

type Props = { children?: React.ReactNode | null };

export default function Toast({ children }: Props) {
  return (
    <div role="alert" className="alert alert-error">
      <icons.ExclamationTriangleIcon className="size-4" />
      <div>{children}</div>
    </div>
  );
}
