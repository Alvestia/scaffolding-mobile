import { z } from 'zod'

export const operationalContextSchema = z.object({
  crewId: z.string().min(1, 'Selecione a equipe.'),
  teamMembers: z.array(z.string()).min(1, 'Selecione ao menos 1 integrante da equipe.'),
})

export type OperationalContextSchema = z.infer<typeof operationalContextSchema>
