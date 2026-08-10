import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IndianRupee } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';

const METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Card', 'Gateway'];

interface Props {
  clientId: number;
  clientName: string;
  remaining: number;
  onClose: () => void;
}

export function AddPaymentModal({ clientId, clientName, remaining, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/clients/${clientId}/payments`, {
        amount: Number(amount),
        method,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('all') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('mine') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success('Payment recorded. An admin must verify it to confirm revenue.');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const amountNum = Number(amount);
  const invalid = !Number.isFinite(amountNum) || amountNum <= 0 || amountNum > remaining + 0.01;

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      subtitle={`${clientName} · up to ${remaining > 0 ? `₹${remaining.toLocaleString('en-IN')} remaining` : 'fully paid'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            disabled={invalid}
            onClick={() => mutation.mutate()}
          >
            <IndianRupee size={14} />
            Save payment
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Amount received (₹)" hint={invalid ? 'Amount must be greater than 0 and not exceed the remaining balance.' : undefined}>
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 2499"
            autoFocus
          />
        </Field>
        <Field label="Payment method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI transaction ID" />
        </Field>
      </div>
      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <IndianRupee size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Payment is saved as pending and needs admin verification before it counts as revenue.</span>
      </div>
    </Modal>
  );
}
