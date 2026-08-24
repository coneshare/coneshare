import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createAutomation,
  createAutomationDestination,
  deleteAutomation,
  deleteAutomationDestination,
  getAutomationDeliveries,
  getAutomationDestinations,
  getAutomations,
  getDatarooms,
  getShareLinks,
  replayAutomationDelivery,
  updateAutomation,
  updateAutomationDestination,
} from '../services/api';
import { Button } from '../components/ui/Button';
import { AutomationBuilder } from '../components/automations/AutomationBuilder';
import { DestinationForm } from '../components/automations/DestinationForm';
import { DeliveryLogsTable } from '../components/automations/DeliveryLogsTable';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/Dialog';

const stringifyErrorValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(stringifyErrorValue).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${key}: ${stringifyErrorValue(val)}`)
      .filter(Boolean)
      .join(' | ');
  }
  return String(value);
};

const getApiErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || 'Unknown error.';
  const detail = stringifyErrorValue(data.detail);
  if (detail) return detail;
  const nonField = stringifyErrorValue(data.non_field_errors);
  if (nonField) return nonField;
  const body = stringifyErrorValue(data);
  if (body) return body;
  return error?.message || 'Unknown error.';
};

const handleActionError = (title, error) => {
  const description = getApiErrorMessage(error);
  toast.error(title, { description });
  console.error(error);
};

export function AutomationsPage() {
  const { t } = useTranslation();
  const [automations, setAutomations] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [deliveriesData, setDeliveriesData] = useState({ results: [], count: 0 });
  const [shareLinks, setShareLinks] = useState([]);
  const [datarooms, setDatarooms] = useState([]);
  const [isLoadingShareLinks, setIsLoadingShareLinks] = useState(false);
  const [isLoadingDatarooms, setIsLoadingDatarooms] = useState(false);
  const [hasFetchedShareLinks, setHasFetchedShareLinks] = useState(false);
  const [hasFetchedDatarooms, setHasFetchedDatarooms] = useState(false);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSavingAutomation, setIsSavingAutomation] = useState(false);
  const [isSavingDestination, setIsSavingDestination] = useState(false);
  const [replayingId, setReplayingId] = useState(null);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [isCreateDestinationOpen, setIsCreateDestinationOpen] = useState(false);
  const [isEditingOpen, setIsEditingOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [selectedRuleIdForLogs, setSelectedRuleIdForLogs] = useState(null);
  const [isEditingDestinationOpen, setIsEditingDestinationOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState(null);
  const [selectedDestinationIdForLogs, setSelectedDestinationIdForLogs] = useState(null);
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [destinationToDelete, setDestinationToDelete] = useState(null);
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const logsPageSize = 10;

  const fetchCoreData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsInitialLoading(true);
    }
    try {
      const [automationsRes, destinationsRes] = await Promise.all([
        getAutomations(),
        getAutomationDestinations(),
      ]);
      setAutomations(automationsRes.data || []);
      setDestinations(destinationsRes.data || []);
    } catch (error) {
      handleActionError('Failed to load automations data.', error);
    } finally {
      if (!silent) {
        setIsInitialLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);

  const automationCountText = useMemo(() => {
    if (automations.length === 0) return t('automations.noRulesYet');
    return `${automations.length} ${t('automations.rules').toLowerCase()}.`;
  }, [automations, t]);

  const selectedRule = useMemo(
    () => automations.find((automation) => automation.id === selectedRuleIdForLogs) || null,
    [automations, selectedRuleIdForLogs]
  );
  const selectedDestination = useMemo(
    () => destinations.find((destination) => destination.id === selectedDestinationIdForLogs) || null,
    [destinations, selectedDestinationIdForLogs]
  );
  const logsRangeText = useMemo(() => {
    const total = deliveriesData.count || 0;
    if (total === 0) return t('automations.noLogs');
    const start = (logsCurrentPage - 1) * logsPageSize + 1;
    const end = Math.min(start + (deliveriesData.results?.length || 0) - 1, total);
    return `Showing ${start}-${end} of ${total} logs.`;
  }, [deliveriesData.count, deliveriesData.results, logsCurrentPage, t]);

  const fetchDeliveries = useCallback(async () => {
    try {
      const response = await getAutomationDeliveries({
        ruleId: selectedRuleIdForLogs,
        destinationId: selectedDestinationIdForLogs,
        page: logsCurrentPage,
      });
      setDeliveriesData(response.data || { results: [], count: 0 });
    } catch (error) {
      handleActionError('Failed to load delivery logs.', error);
    }
  }, [selectedRuleIdForLogs, selectedDestinationIdForLogs, logsCurrentPage]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const ensureShareLinksLoaded = useCallback(async () => {
    if (hasFetchedShareLinks || isLoadingShareLinks) return;
    setIsLoadingShareLinks(true);
    try {
      const response = await getShareLinks();
      setShareLinks(response.data || []);
      setHasFetchedShareLinks(true);
    } catch (error) {
      handleActionError('Failed to load share links.', error);
    } finally {
      setIsLoadingShareLinks(false);
    }
  }, [hasFetchedShareLinks, isLoadingShareLinks]);

  const ensureDataroomsLoaded = useCallback(async () => {
    if (hasFetchedDatarooms || isLoadingDatarooms) return;
    setIsLoadingDatarooms(true);
    try {
      const response = await getDatarooms();
      setDatarooms(response.data || []);
      setHasFetchedDatarooms(true);
    } catch (error) {
      handleActionError('Failed to load datarooms.', error);
    } finally {
      setIsLoadingDatarooms(false);
    }
  }, [hasFetchedDatarooms, isLoadingDatarooms]);

  const handleAutomationScopeChange = useCallback((scopeType) => {
    if (scopeType === 'share_link') {
      ensureShareLinksLoaded();
      return;
    }
    if (scopeType === 'dataroom') {
      ensureDataroomsLoaded();
    }
  }, [ensureShareLinksLoaded, ensureDataroomsLoaded]);

  const handleCreateAutomation = async (payload) => {
    setIsSavingAutomation(true);
    try {
      await createAutomation(payload);
      toast.success('Automation created.');
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to create automation.', error);
      throw error;
    } finally {
      setIsSavingAutomation(false);
    }
  };

  const handleCreateDestination = async (payload) => {
    setIsSavingDestination(true);
    try {
      await createAutomationDestination(payload);
      toast.success('Destination saved.');
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to save destination.', error);
      throw error;
    } finally {
      setIsSavingDestination(false);
    }
  };

  const handleToggleAutomation = async (automation) => {
    try {
      await updateAutomation(automation.id, { is_active: !automation.is_active });
      toast.success(`Automation ${automation.is_active ? 'disabled' : 'enabled'}.`);
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to update automation state.', error);
    }
  };

  const handleConfirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      await deleteAutomation(ruleToDelete.id);
      toast.success('Automation deleted.');
      setRuleToDelete(null);
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to delete automation.', error);
    }
  };

  const handleOpenEdit = (automation) => {
    setEditingAutomation(automation);
    setIsEditingOpen(true);
  };

  const handleUpdateAutomation = async (payload) => {
    if (!editingAutomation) return;
    setIsSavingAutomation(true);
    try {
      await updateAutomation(editingAutomation.id, payload);
      toast.success('Automation updated.');
      setIsEditingOpen(false);
      setEditingAutomation(null);
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to update automation.', error);
      throw error;
    } finally {
      setIsSavingAutomation(false);
    }
  };

  const handleConfirmDeleteDestination = async () => {
    if (!destinationToDelete) return;
    try {
      await deleteAutomationDestination(destinationToDelete.id);
      toast.success('Destination deleted.');
      setDestinationToDelete(null);
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to delete destination.', error);
    }
  };

  const handleOpenEditDestination = (destination) => {
    setEditingDestination(destination);
    setIsEditingDestinationOpen(true);
  };

  const handleUpdateDestination = async (payload) => {
    if (!editingDestination) return;
    setIsSavingDestination(true);
    try {
      await updateAutomationDestination(editingDestination.id, payload);
      toast.success('Destination updated.');
      setIsEditingDestinationOpen(false);
      setEditingDestination(null);
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      handleActionError('Failed to update destination.', error);
      throw error;
    } finally {
      setIsSavingDestination(false);
    }
  };

  const handleReplay = async (deliveryId) => {
    setReplayingId(deliveryId);
    try {
      await replayAutomationDelivery(deliveryId);
      toast.success('Replay queued.');
      await fetchDeliveries();
    } catch (error) {
      handleActionError('Failed to replay delivery.', error);
    } finally {
      setReplayingId(null);
    }
  };

  return (
    <div className="container mx-auto space-y-8 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold">{t('automations.title')}</h1>
        <p className="text-sm text-gray-500">
          {t('automations.subtitle')}
        </p>
      </section>

      {isInitialLoading ? (
        <div className="rounded-lg border p-4 text-sm text-gray-500">{t('automations.loading')}</div>
      ) : (
        <>
          <Dialog open={isCreateRuleOpen} onOpenChange={(open) => {
            if (!isSavingAutomation) {
              setIsCreateRuleOpen(open);
            }
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('automations.createRuleTitle')}</DialogTitle>
              </DialogHeader>
              <AutomationBuilder
                destinations={destinations}
                shareLinks={shareLinks}
                datarooms={datarooms}
                onScopeTypeChange={handleAutomationScopeChange}
                onSubmit={async (payload) => {
                  await handleCreateAutomation(payload);
                  setIsCreateRuleOpen(false);
                }}
                loading={isSavingAutomation}
                submitLabel={t('automations.createRule')}
                title={t('automations.newRule')}
                description={t('automations.ruleDescription')}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDestinationOpen} onOpenChange={(open) => {
            if (!isSavingDestination) {
              setIsCreateDestinationOpen(open);
            }
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('automations.createDestination')}</DialogTitle>
              </DialogHeader>
              <DestinationForm
                onSubmit={async (payload) => {
                  await handleCreateDestination(payload);
                  setIsCreateDestinationOpen(false);
                }}
                loading={isSavingDestination}
                submitLabel={t('automations.createDestination')}
                title={t('automations.newDestination')}
                description={t('automations.destinationDescription')}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isEditingOpen} onOpenChange={(open) => {
            if (!isSavingAutomation) {
              setIsEditingOpen(open);
              if (!open) setEditingAutomation(null);
            }
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('automations.editRuleTitle')}</DialogTitle>
              </DialogHeader>
              {editingAutomation && (
                <AutomationBuilder
                  destinations={destinations}
                  shareLinks={shareLinks}
                  datarooms={datarooms}
                  onScopeTypeChange={handleAutomationScopeChange}
                  onSubmit={handleUpdateAutomation}
                  loading={isSavingAutomation}
                  initialValues={editingAutomation}
                  submitLabel={t('common.save')}
                  onCancel={() => {
                    setIsEditingOpen(false);
                    setEditingAutomation(null);
                  }}
                  title={t('automations.editRuleTitle')}
                  description={t('automations.ruleDescription')}
                />
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isEditingDestinationOpen} onOpenChange={(open) => {
            if (!isSavingDestination) {
              setIsEditingDestinationOpen(open);
              if (!open) setEditingDestination(null);
            }
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('automations.editDestinationTitle')}</DialogTitle>
              </DialogHeader>
              {editingDestination && (
                <DestinationForm
                  onSubmit={handleUpdateDestination}
                  loading={isSavingDestination}
                  initialValues={editingDestination}
                  submitLabel={t('common.save')}
                  onCancel={() => {
                    setIsEditingDestinationOpen(false);
                    setEditingDestination(null);
                  }}
                  title={t('automations.editDestinationTitle')}
                  description={t('automations.destinationDescription')}
                />
              )}
            </DialogContent>
          </Dialog>

          <ConfirmationDialog
            isOpen={!!ruleToDelete}
            onOpenChange={() => setRuleToDelete(null)}
            title={t('common.delete')}
            description={`Are you sure you want to delete "${ruleToDelete?.name}"?`}
            onConfirm={handleConfirmDeleteRule}
            confirmText={t('common.delete')}
          />

          <ConfirmationDialog
            isOpen={!!destinationToDelete}
            onOpenChange={() => setDestinationToDelete(null)}
            title={t('common.delete')}
            description={`Are you sure you want to delete destination "${destinationToDelete?.name}"?`}
            onConfirm={handleConfirmDeleteDestination}
            confirmText={t('common.delete')}
          />

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('automations.rules')}</h2>
              <Button size="sm" onClick={() => setIsCreateRuleOpen(true)}>
                {t('automations.newRule')}
              </Button>
            </div>
            <div>
              <p className="text-sm text-gray-500">{automationCountText}</p>
            </div>
            <div className="space-y-2">
              {automations.length === 0 && (
                <p className="text-sm text-gray-500">{t('automations.noRulesYet')}</p>
              )}
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  className={`flex items-start justify-between gap-3 rounded-md border p-3 transition-colors ${
                    automation.is_active
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-gray-200 bg-gray-50 opacity-80'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{automation.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          automation.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {automation.is_active ? t('automations.enabled') : t('automations.disabled')}
                      </span>
                    </div>
                    <p
                      className={`truncate text-xs ${automation.is_active ? 'text-gray-600' : 'text-gray-500'}`}
                      title={`${t('analytics.scope')}: ${automation.scope_type} | ${t('automations.event')}: ${(automation.subscribed_events || []).join(', ') || '-'}`}
                    >
                      {t('analytics.scope')}: {automation.scope_type} | {t('automations.event')}: {(automation.subscribed_events || []).join(', ') || '-'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(automation)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLogsCurrentPage(1);
                        setSelectedRuleIdForLogs((prev) => (prev === automation.id ? null : automation.id));
                      }}
                    >
                      {selectedRuleIdForLogs === automation.id ? t('automations.showAllLogs') : t('automations.viewLogs')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleToggleAutomation(automation)}>
                      {automation.is_active ? t('automations.disable') : t('automations.enable')}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setRuleToDelete(automation)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('automations.destinations')}</h2>
              <Button size="sm" onClick={() => setIsCreateDestinationOpen(true)}>
                {t('automations.newDestination')}
              </Button>
            </div>
            <div className="space-y-2">
              {destinations.length === 0 && <p className="text-sm text-gray-500">{t('automations.noDestinationsYet')}</p>}
              {destinations.map((destination) => (
                <div key={destination.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{destination.name}</p>
                    <p className="truncate text-xs text-gray-500" title={`${destination.destination_type} | ${destination.endpoint_url}`}>
                      {destination.destination_type} | {destination.endpoint_url}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEditDestination(destination)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLogsCurrentPage(1);
                        setSelectedDestinationIdForLogs((prev) => (prev === destination.id ? null : destination.id));
                      }}
                    >
                      {selectedDestinationIdForLogs === destination.id ? t('automations.showAllLogs') : t('automations.viewLogs')}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDestinationToDelete(destination)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t('automations.deliveryLogs')}</h2>
              <p className="text-sm text-gray-500">
                {t('automations.deliveryLogsSubtitle')}
              </p>
              <p className="text-xs text-gray-500">{logsRangeText}</p>
            </div>
            {(selectedRule || selectedDestination) && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-gray-50 p-2 text-xs">
                <span className="text-gray-500">Active filters:</span>
                {selectedRule && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRuleIdForLogs(null);
                      setLogsCurrentPage(1);
                    }}
                    className="rounded-full border bg-white px-2 py-1 hover:bg-gray-100"
                  >
                    Rule: {selectedRule.name} ×
                  </button>
                )}
                {selectedDestination && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDestinationIdForLogs(null);
                      setLogsCurrentPage(1);
                    }}
                    className="rounded-full border bg-white px-2 py-1 hover:bg-gray-100"
                  >
                    Destination: {selectedDestination.name} ×
                  </button>
                )}
              </div>
            )}
            <DeliveryLogsTable deliveries={deliveriesData.results || []} onReplay={handleReplay} replayingId={replayingId} />
            <Pagination
              currentPage={logsCurrentPage}
              totalPages={Math.ceil((deliveriesData.count || 0) / logsPageSize)}
              onPageChange={setLogsCurrentPage}
            />
          </section>
        </>
      )}
    </div>
  );
}
