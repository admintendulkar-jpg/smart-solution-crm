import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requireAuth } from '../../auth/guards';
import { config } from '../../config';
import { get } from '../../db';
import { AppError, asyncHandler } from '../../errors';

const router = Router();

router.use(requireAuth);

router.get(
  '/file/:filename',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const rawFilename = String(req.params.filename ?? '');
    
    // Prevent path traversal
    const safeFilename = path.basename(rawFilename);
    if (!safeFilename || safeFilename !== rawFilename || safeFilename.includes('..')) {
      throw new AppError(400, 'Invalid filename format.', 'INVALID_FILENAME');
    }

    const filePath = path.join(config.uploadDir, safeFilename);

    // Verify resolved path stays strictly inside uploadDir
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(config.uploadDir);
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      throw new AppError(403, 'Path traversal detected.', 'FORBIDDEN');
    }

    if (!fs.existsSync(filePath)) {
      throw new AppError(404, 'File not found.', 'FILE_NOT_FOUND');
    }

    // Role and Ownership Authorization Check
    let isAuthorized = false;

    // Super Admin & Admin have full access
    if (['super_admin', 'admin'].includes(user.role)) {
      isAuthorized = true;
    }

    // Check Employee Documents
    if (!isAuthorized) {
      const empDoc = get<{ user_id: number }>(
        'SELECT user_id FROM employee_documents WHERE file_path = ? OR file_path LIKE ?',
        [safeFilename, `%${safeFilename}`],
      );
      if (empDoc) {
        if (user.role === 'hr' || empDoc.user_id === user.id) {
          isAuthorized = true;
        }
      }
    }

    // Check Payment Proofs
    if (!isAuthorized) {
      const paymentProof = get<{ client_id: number; sales_person_id: number | null; assigned_to: number | null }>(
        `SELECT p.id, c.sales_person_id, c.assigned_to 
         FROM payments p 
         JOIN clients c ON c.id = p.client_id 
         WHERE p.proof_path = ? OR p.proof_path LIKE ?`,
        [safeFilename, `%${safeFilename}`],
      );
      if (paymentProof) {
        if (
          (user.role === 'sales' && paymentProof.sales_person_id === user.id) ||
          (user.role === 'service' && paymentProof.assigned_to === user.id)
        ) {
          isAuthorized = true;
        }
      }
    }

    // Check General Entity Documents
    if (!isAuthorized) {
      const entityDoc = get<{ entity_type: string; entity_id: number; uploaded_by: number | null }>(
        'SELECT entity_type, entity_id, uploaded_by FROM documents WHERE stored_name = ?',
        [safeFilename],
      );
      if (entityDoc) {
        if (entityDoc.uploaded_by === user.id) {
          isAuthorized = true;
        } else if (entityDoc.entity_type === 'client') {
          const client = get<{ sales_person_id: number | null; assigned_to: number | null }>(
            'SELECT sales_person_id, assigned_to FROM clients WHERE id = ?',
            [entityDoc.entity_id],
          );
          if (
            (user.role === 'sales' && client?.sales_person_id === user.id) ||
            (user.role === 'service' && client?.assigned_to === user.id)
          ) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
      throw new AppError(403, 'You do not have permission to view or download this document.', 'FORBIDDEN');
    }

    res.sendFile(filePath);
  }),
);

export const documentsRoutes = router;
