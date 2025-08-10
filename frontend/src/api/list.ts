import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { match } from 'ts-pattern';

import { ListItem } from '../../../types/bindings/ListItem';

const listZerrae = () =>
  axios.get('/api', { responseType: 'json' }).then((res) => res.data as ListItem[]);
const newZerra = () => axios.get('/api/new');
const importZerra = async (yaml: File) => axios.post('/api/import', await yaml.text());
const copyZerra = (uuid: string) => axios.get(`/api/copy/${uuid}`);
const deleteZerra = (uuid: string) => axios.get(`/api/delete/${uuid}`);

export type ListAction =
  | { action: 'new' }
  | { action: 'import'; yaml: File }
  | ({ uuid: string } & ({ action: 'copy' } | { action: 'delete' }));

type Options = { onActionError: (action: ListAction) => void };

export function useZerraList({ onActionError }: Options) {
  const queryClient = useQueryClient();
  const listItems = useQuery({ queryKey: ['zerrae'], queryFn: listZerrae });
  const listMutation = useMutation({
    mutationFn: (action: ListAction) =>
      match(action)
        .with({ action: 'new' }, () => newZerra())
        .with({ action: 'import' }, ({ yaml }) => importZerra(yaml))
        .with({ action: 'copy' }, ({ uuid }) => copyZerra(uuid))
        .with({ action: 'delete' }, ({ uuid }) => deleteZerra(uuid))
        .exhaustive(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['zerrae'] }),
    onError: (_, action) => onActionError(action),
  });

  return {
    items: listItems.data,
    fetchStatus: listItems.status,
    dispatchAction: listMutation.mutate,
  };
}
