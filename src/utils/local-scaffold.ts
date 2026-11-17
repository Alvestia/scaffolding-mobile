import type { LocalScaffoldService } from '@/types/local-scaffold'
import type { QueueServiceItem } from '@/types/scaffold-service'
import type { ScaffoldGeolocation } from '@/types/scaffold-geolocation'

/**
 * Converte um serviço local (offline) para o formato QueueServiceItem,
 * permitindo que o restante da UI trate serviços locais e remotos de forma idêntica.
 *
 * O campo `id` do item retornado é o `localId` do serviço local (ex: "svc_<uuid>").
 * O sync-engine resolve esse ID para o ID remoto real no momento da sincronização.
 */
export function localServiceToQueueItem(
  service: LocalScaffoldService,
  location?: ScaffoldGeolocation,
): QueueServiceItem {
  return {
    id: service.localId,
    scaffoldId: service.localScaffoldId,
    workOrderId: service.workOrderId ?? null,
    type: service.type,
    plannedUnit: service.plannedUnit,
    plannedQuantity: service.plannedQuantity ?? 0,
    executedQuantity: 0,
    progress: 0,
    status: 'NAO_INICIADO',
    description: service.description ?? null,
    startForecast: null,
    endForecast: null,
    scaffold: {
      ...(location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            locationAccuracyMeters: location.accuracyMeters,
            locationCapturedAt: location.capturedAt,
          }
        : {}),
      id: service.localScaffoldId,
      code: service.scaffoldCode ?? 'Andaime offline',
      description: service.scaffoldDescription ?? null,
      areaId: service.areaId ?? null,
      areaRef: service.areaId
        ? {
            id: service.areaId,
            code: service.areaCode ?? null,
            name: service.areaName ?? 'Área selecionada',
          }
        : null,
    },
    workOrder: service.workOrderId
      ? {
          id: service.workOrderId,
          code: service.workOrderCode ?? 'OS selecionada',
        }
      : null,
    scaffoldComponent: null,
  }
}
