import {
  ExecutionInputType,
  type ExecutionInputType as ExecutionInputTypeValue,
} from '@/types/execution'
import { MeasurementUnit, type MeasurementUnit as MeasurementUnitValue } from '@/types/scaffold-service'

type MeasurementDimensions = {
  height?: number
  width?: number
  length?: number
}

export function mapMeasurementUnitToExecutionInputType(
  measurementUnit: MeasurementUnitValue,
): ExecutionInputTypeValue {
  return ExecutionInputType.QUANTIDADE
}

export function getMeasurementUnitLabel(measurementUnit: MeasurementUnitValue) {
  switch (measurementUnit) {
    case MeasurementUnit.M3:
      return 'm3'
    case MeasurementUnit.M2:
      return 'm2'
    case MeasurementUnit.LINEAR_M:
      return 'm linear'
    case MeasurementUnit.UNIDADE:
    default:
      return 'unidade'
  }
}

export function getVisibleMeasurementDimensions(measurementUnit: MeasurementUnitValue) {
  switch (measurementUnit) {
    case MeasurementUnit.M3:
      return { height: true, width: true, length: true }
    case MeasurementUnit.M2:
      return { height: true, width: false, length: true }
    case MeasurementUnit.LINEAR_M:
      return { height: false, width: false, length: true }
    case MeasurementUnit.UNIDADE:
    default:
      return { height: false, width: false, length: false }
  }
}

export function normalizeMeasuredDimensions(
  measurementUnit: MeasurementUnitValue,
  dimensions: MeasurementDimensions,
): MeasurementDimensions {
  const visible = getVisibleMeasurementDimensions(measurementUnit)

  return {
    height: visible.height ? dimensions.height : undefined,
    width: visible.width ? dimensions.width : undefined,
    length: visible.length ? dimensions.length : undefined,
  }
}

export function calculateMeasuredTotal(
  measurementUnit: MeasurementUnitValue,
  dimensions: MeasurementDimensions,
) {
  const normalizedDimensions = normalizeMeasuredDimensions(measurementUnit, dimensions)
  const height = Number(normalizedDimensions.height ?? 0)
  const width = Number(normalizedDimensions.width ?? 0)
  const length = Number(normalizedDimensions.length ?? 0)

  switch (measurementUnit) {
    case MeasurementUnit.M3:
      return Number((height * width * length).toFixed(3))
    case MeasurementUnit.M2:
      return Number((height * length).toFixed(3))
    case MeasurementUnit.LINEAR_M:
      return Number(length.toFixed(3))
    case MeasurementUnit.UNIDADE:
    default:
      return 1
  }
}
