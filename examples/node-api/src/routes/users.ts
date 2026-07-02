import { Router } from 'express'
import { z } from 'zod'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const usersRouter = Router()

usersRouter.get('/users', (req, res) => {
  const query = querySchema.parse(req.query)

  res.json({
    data: [],
    limit: query.limit,
  })
})
