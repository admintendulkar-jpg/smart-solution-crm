import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../auth/guards';
import { AppError, asyncHandler } from '../../errors';
import { initiateClickToCall, reconcileCallLogStatus } from './service';
import { handleCallyzerWebhook, handleExotelWebhook } from './webhook';

const router = Router();

const initiateCallSchema = z.object({
  leadId: z.number().optional(),
  clientId: z.number().optional(),
  customerPhone: z.string().optional(),
});

// Click-to-Call Endpoint (Protected)
router.post(
  '/call',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = initiateCallSchema.parse(req.body);

    if (!body.leadId && !body.clientId) {
      throw new AppError(400, 'Either leadId or clientId is required.', 'VALIDATION_ERROR');
    }

    const result = await initiateClickToCall(
      {
        leadId: body.leadId,
        clientId: body.clientId,
        customerPhone: body.customerPhone || '',
        agentUserId: user.id,
        agentPhone: user.phone || '',
      },
      user
    );

    res.status(201).json(result);
  })
);

// Call Status & Fallback Reconciliation Endpoint (Protected)
router.get(
  '/call/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const callLogId = Number(req.params.id);
    if (!Number.isInteger(callLogId) || callLogId <= 0) {
      throw new AppError(400, 'Invalid call log ID.', 'VALIDATION_ERROR');
    }
    const record = await reconcileCallLogStatus(callLogId);
    if (!record) {
      throw new AppError(404, 'Call log record not found.', 'NOT_FOUND');
    }
    res.json({ callLog: record });
  })
);

// Exotel Webhook Handler (Public Endpoint for Exotel Server callbacks)
router.post('/exotel/webhook', asyncHandler(handleExotelWebhook));

// Callyzer Webhook Handler (Public Endpoint for Callyzer App/Server callbacks)
router.post('/callyzer/webhook', asyncHandler(handleCallyzerWebhook));

export const telephonyRoutes = router;
