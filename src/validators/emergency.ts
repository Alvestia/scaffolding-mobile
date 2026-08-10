import { z } from 'zod'

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

export const emergencyScaffoldSchema = z
  .object({
    scaffoldTypeId: z.string().min(1, 'Selecione o tipo de andaime.'),
    measurementUnit: z.enum(['M3', 'M2', 'LINEAR_M', 'UNIDADE']),
    code: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    height: z.string().optional(),
    width: z.string().optional(),
    length: z.string().optional(),
    initialExecutedQuantity: z
      .string()
      .min(1, 'Informe a quantidade executada agora.')
      .refine((value) => Number(value) > 0, 'A quantidade executada deve ser maior que zero.'),
    startTime: z.string().regex(timeRegex, 'Use o formato HH:mm.'),
    endTime: z.string().regex(timeRegex, 'Use o formato HH:mm.'),
    notes: z.string().optional(),
  })
  .refine((values) => values.endTime > values.startTime, {
    message: 'O horario final deve ser posterior ao inicial.',
    path: ['endTime'],
  })

export type EmergencyScaffoldSchema = z.infer<typeof emergencyScaffoldSchema>
