import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/Dialog';

export function AutomationsPage() {
  const [automations, setAutomations] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [deliveriesData, setDeliveriesData] = useState({ results: [], count: 0 });
  const [shareLinks, setShareLinks] = useState([]);
  const [datarooms, setDatarooms] = useState([]);

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
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const logsPageSize = 10;

  const fetchCoreData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsInitialLoading(true);
    }
    try {
      const [automationsRes, destinationsRes, shareLinksRes, dataroomsRes] = await Promise.all([
        getAutomations(),
        getAutomationDestinations(),
        getShareLinks(),
        getDatarooms(),
      ]);
      setAutomations(automationsRes.data || []);
      setDestinations(destinationsRes.data || []);
      setShareLinks(shareLinksRes.data || []);
      setDatarooms(dataroomsRes.data || []);
    } catch (error) {
      console.error(error);
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
    if (automations.length === 0) return 'No automations created yet.';
    if (automations.length === 1) return '1 automation configured.';
    return `${automations.length} automations configured.`;
  }, [automations]);

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
    if (total === 0) return 'Showing 0 logs.';
    const start = (logsCurrentPage - 1) * logsPageSize + 1;
    const end = Math.min(start + (deliveriesData.results?.length || 0) - 1, total);
    return `Showing ${start}-${end} of ${total} logs.`;
  }, [deliveriesData.count, deliveriesData.results, logsCurrentPage]);

  const fetchDeliveries = useCallback(async () => {
    try {
      const response = await getAutomationDeliveries({
        ruleId: selectedRuleIdForLogs,
        destinationId: selectedDestinationIdForLogs,
        page: logsCurrentPage,
      });
      setDeliveriesData(response.data || { results: [], count: 0 });
    } catch (error) {
      console.error(error);
    }
  }, [selectedRuleIdForLogs, selectedDestinationIdForLogs, logsCurrentPage]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const handleCreateAutomation = async (payload) => {
    setIsSavingAutomation(true);
    try {
      await createAutomation(payload);
      toast.success('Automation created.');
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      console.error(error);
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
      console.error(error);
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
      console.error(error);
    }
  };

  const handleDeleteAutomation = async (automationId) => {
    try {
      await deleteAutomation(automationId);
      toast.success('Automation deleted.');
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      console.error(error);
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
      console.error(error);
    } finally {
      setIsSavingAutomation(false);
    }
  };

  const handleDeleteDestination = async (destinationId) => {
    try {
      await deleteAutomationDestination(destinationId);
      toast.success('Destination deleted.');
      await Promise.all([fetchCoreData({ silent: true }), fetchDeliveries()]);
    } catch (error) {
      console.error(error);
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
      console.error(error);
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
      console.error(error);
    } finally {
      setReplayingId(null);
    }
  };

  return (
    <div className="container mx-auto space-y-8 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold">Automations</h1>
        <p className="text-sm text-gray-500">
          Build event-driven workflows using webhooks or Slack destinations.
        </p>
      </section>

      {isInitialLoading ? (
        <div className="rounded-lg border p-4 text-sm text-gray-500">Loading automations...</div>
      ) : (
        <>
          <Dialog open={isCreateRuleOpen} onOpenChange={setIsCreateRuleOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Automation Rule</DialogTitle>
              </DialogHeader>
              <AutomationBuilder
                destinations={destinations}
                shareLinks={shareLinks}
                datarooms={datarooms}
                onSubmit={async (payload) => {
                  await handleCreateAutomation(payload);
                  setIsCreateRuleOpen(false);
                }}
                loading={isSavingAutomation}
                submitLabel="Create Rule"
                title="New Rule"
                description="Define scope, events, and destination routing."
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDestinationOpen} onOpenChange={setIsCreateDestinationOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Destination</DialogTitle>
              </DialogHeader>
              <DestinationForm
                onSubmit={async (payload) => {
                  await handleCreateDestination(payload);
                  setIsCreateDestinationOpen(false);
                }}
                loading={isSavingDestination}
                submitLabel="Create Destination"
                title="New Destination"
                description="Add where automation notifications should be delivered."
              />
            </DialogContent>
          </Dialog>

          <Dialog open={isEditingOpen} onOpenChange={(open) => {
            setIsEditingOpen(open);
            if (!open) setEditingAutomation(null);
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Automation Rule</DialogTitle>
              </DialogHeader>
              {editingAutomation && (
                <AutomationBuilder
                  destinations={destinations}
                  shareLinks={shareLinks}
                  datarooms={datarooms}
                  onSubmit={handleUpdateAutomation}
                  loading={isSavingAutomation}
                  initialValues={editingAutomation}
                  submitLabel="Save Changes"
                  onCancel={() => {
                    setIsEditingOpen(false);
                    setEditingAutomation(null);
                  }}
                  title="Edit Rule"
                  description="Update scope, event triggers, and destinations."
                />
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isEditingDestinationOpen} onOpenChange={(open) => {
            setIsEditingDestinationOpen(open);
            if (!open) setEditingDestination(null);
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Destination</DialogTitle>
              </DialogHeader>
              {editingDestination && (
                <DestinationForm
                  onSubmit={handleUpdateDestination}
                  loading={isSavingDestination}
                  initialValues={editingDestination}
                  submitLabel="Save Changes"
                  onCancel={() => {
                    setIsEditingDestinationOpen(false);
                    setEditingDestination(null);
                  }}
                  title="Edit Destination"
                  description="Update destination type, endpoint URL, and method."
                />
              )}
            </DialogContent>
          </Dialog>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Rules</h2>
              <Button size="sm" onClick={() => setIsCreateRuleOpen(true)}>
                New Rule
              </Button>
            </div>
            <div>
              <p className="text-sm text-gray-500">{automationCountText}</p>
            </div>
            <div className="space-y-2">
              {automations.length === 0 && (
                <p className="text-sm text-gray-500">Create your first automation above.</p>
              )}
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition-colors ${
                    automation.is_active
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-gray-200 bg-gray-50 opacity-80'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{automation.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          automation.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {automation.is_active ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className={`text-xs ${automation.is_active ? 'text-gray-600' : 'text-gray-500'}`}>
                      scope: {automation.scope_type} | events: {(automation.subscribed_events || []).join(', ') || '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(automation)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedRuleIdForLogs((prev) => {
                          setLogsCurrentPage(1);
                          return prev === automation.id ? null : automation.id;
                        })
                      }
                    >
                      {selectedRuleIdForLogs === automation.id ? 'Show All Logs' : 'View Logs'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleToggleAutomation(automation)}>
                      {automation.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteAutomation(automation.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Destinations</h2>
              <Button size="sm" onClick={() => setIsCreateDestinationOpen(true)}>
                New Destination
              </Button>
            </div>
            <div className="space-y-2">
              {destinations.length === 0 && <p className="text-sm text-gray-500">No destinations configured.</p>}
              {destinations.map((destination) => (
                <div key={destination.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{destination.name}</p>
                    <p className="text-xs text-gray-500">{destination.destination_type} | {destination.endpoint_url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEditDestination(destination)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedDestinationIdForLogs((prev) => {
                          setLogsCurrentPage(1);
                          return prev === destination.id ? null : destination.id;
                        })
                      }
                    >
                      {selectedDestinationIdForLogs === destination.id ? 'Show All Logs' : 'View Logs'}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteDestination(destination.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Delivery Logs</h2>
              <p className="text-sm text-gray-500">
                Replay failed or dead-letter deliveries.
                {selectedRuleIdForLogs || selectedDestinationIdForLogs
                  ? ' Showing filtered logs.'
                  : ' Showing all rules.'}
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
