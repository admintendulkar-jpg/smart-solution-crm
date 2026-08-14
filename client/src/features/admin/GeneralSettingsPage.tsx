import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { BRANCHES, QUERY_KEYS, SETTINGS_KEYS } from '@/lib/constants';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader, CardBody } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { useToast } from '@/ui/Toast';

interface SettingsPayload {
  settings: Record<string, string>;
}

export function GeneralSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: () => api.get<SettingsPayload>('/admin/settings'),
  });

  const [branch, setBranch] = useState<string | null>(null);
  const [sla, setSla] = useState<number | null>(null);

  const effective = {
    branch: branch ?? settingsData?.settings[SETTINGS_KEYS.defaultBranch] ?? 'Coimbatore',
    sla: sla ?? Number(settingsData?.settings[SETTINGS_KEYS.slaBusinessDays] ?? 4),
  };

  const saveSettings = useMutation({
    mutationFn: () =>
      api.put('/admin/settings', {
        [SETTINGS_KEYS.defaultBranch]: effective.branch,
        [SETTINGS_KEYS.slaBusinessDays]: effective.sla,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      toast.success('General settings saved successfully.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="General Settings" subtitle="System-wide defaults for branches, SLA business days, and CRM policies." />

      <div style={{ maxWidth: 640 }}>
        <Card>
          <CardHeader title="CRM System Configuration" subtitle="Applies across all branches and modules" />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Field label="Default Branch for Imports" hint="Applied to imported leads when no branch is specified in CSV or Sheets">
                <Select value={effective.branch} onChange={(e) => setBranch(e.target.value)}>
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Service SLA (Business Days)" hint="Auto-calculated due date when a lead is converted into a client project">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={effective.sla}
                  onChange={(e) => setSla(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </Field>

              <div style={{ paddingTop: 8 }}>
                <Button
                  icon={<SlidersHorizontal size={15} />}
                  loading={saveSettings.isPending}
                  onClick={() => saveSettings.mutate()}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
