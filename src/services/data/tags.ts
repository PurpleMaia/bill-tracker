'use server';

import { db } from '@/db/kysely/client';
import type { Tag } from '@/types/legislation';

// ============================================================================
// TAG CRUD OPERATIONS
// ============================================================================

/**
 * Fetches all tags from the database
 * @returns Array of all tags, ordered by name
 */
export async function getAllTags(tenantId?: string): Promise<Tag[]> {
  try {
    let query = db
      .selectFrom('tags')
      .selectAll();

    if (tenantId) {
      query = query.where('tenant_id', '=', tenantId);
    }

    const tags = await query
      .orderBy('name', 'asc')
      .execute();

    return tags as Tag[];
  } catch (error: any) {
    // If table doesn't exist, return empty array instead of error
    if (error?.message?.includes('does not exist') || error?.code === '42P01') {
      console.log('Tags table does not exist yet, returning empty array');
      return [];
    }
    console.error('Error fetching tags:', error);
    return [];
  }
}

/**
 * Creates a new tag in the database
 * @param name - Tag name
 * @param color - Optional hex color code
 * @returns The created tag
 * @throws Error if tag creation fails or tag with same name exists
 */
export async function createTag(name: string, color?: string, tenantId?: string): Promise<Tag> {
  try {
    console.log('Creating new tag:', name, 'for tenant:', tenantId?.slice(0, 6) ?? 'global', '...');
    // Check if tag with same name already exists in this tenant
    let existingQuery = db
      .selectFrom('tags')
      .select('id')
      .where('name', '=', name.trim());

    if (tenantId) {
      existingQuery = existingQuery.where('tenant_id', '=', tenantId);
    }

    const existingTag = await existingQuery.executeTakeFirst();

    if (existingTag) {
      throw new Error('Tag with this name already exists');
    }

    const newTag = await db
      .insertInto('tags')
      .values({
        name: name.trim(),
        color: color || null,
        tenant_id: tenantId ?? null,
      })
      .returningAll()
      .executeTakeFirst();

    if (!newTag) {
      throw new Error('Failed to create tag');
    }

    return newTag as Tag;
  } catch (error) {
    console.error('Error creating tag:', error);
    throw error instanceof Error ? error : new Error('Failed to create tag');
  }
}

/**
 * Updates an existing tag
 * @param id - Tag ID
 * @param name - New tag name
 * @param color - Optional new hex color code
 * @returns The updated tag
 * @throws Error if tag not found or update fails
 */
export async function updateTag(id: string, name: string, color?: string, tenantId?: string): Promise<Tag> {
  try {
    // Check if tag exists and belongs to the caller's tenant
    let existingQuery = db
      .selectFrom('tags')
      .select(['id', 'tenant_id'])
      .where('id', '=', id);

    if (tenantId) {
      existingQuery = existingQuery.where('tenant_id', '=', tenantId);
    }

    const existingTag = await existingQuery.executeTakeFirst();

    if (!existingTag) {
      throw new Error('Tag not found');
    }

    // Check if another tag with same name exists within tenant scope
    let duplicateQuery = db
      .selectFrom('tags')
      .select('id')
      .where('name', '=', name.trim())
      .where('id', '!=', id);

    if (tenantId) {
      duplicateQuery = duplicateQuery.where('tenant_id', '=', tenantId);
    }

    const duplicateTag = await duplicateQuery.executeTakeFirst();

    if (duplicateTag) {
      throw new Error('Tag with this name already exists');
    }

    let updateQuery = db
      .updateTable('tags')
      .set({
        name: name.trim(),
        color: color || null,
        updated_at: new Date(),
      })
      .where('id', '=', id);

    if (tenantId) {
      updateQuery = updateQuery.where('tenant_id', '=', tenantId);
    }

    const updatedTag = await updateQuery
      .returningAll()
      .executeTakeFirst();

    if (!updatedTag) {
      throw new Error('Failed to update tag');
    }

    return updatedTag as Tag;
  } catch (error) {
    console.error('Error updating tag:', error);
    throw error instanceof Error ? error : new Error('Failed to update tag');
  }
}

/**
 * Deletes a tag from the database
 * Cascade will automatically remove bill_tags associations
 * @param id - Tag ID
 * @throws Error if tag not found or deletion fails
 */
export async function deleteTag(id: string, tenantId?: string): Promise<void> {
  try {
    // Check if tag exists and belongs to the caller's tenant
    let existingQuery = db
      .selectFrom('tags')
      .select('id')
      .where('id', '=', id);

    if (tenantId) {
      existingQuery = existingQuery.where('tenant_id', '=', tenantId);
    }

    const existingTag = await existingQuery.executeTakeFirst();

    if (!existingTag) {
      throw new Error('Tag not found');
    }

    let deleteQuery = db.deleteFrom('tags').where('id', '=', id);
    if (tenantId) {
      deleteQuery = deleteQuery.where('tenant_id', '=', tenantId);
    }
    await deleteQuery.execute();
  } catch (error) {
    console.error('Error deleting tag:', error);
    throw error instanceof Error ? error : new Error('Failed to delete tag');
  }
}

// ============================================================================
// BILL TAG OPERATIONS
// ============================================================================

/**
 * Fetches all tags associated with a specific bill
 * @param billId - Bill ID
 * @returns Array of tags for the bill, ordered by name
 */
export async function getBillTags(billId: string, tenantId?: string): Promise<Tag[]> {
  try {
    let query = db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId);

    if (tenantId) {
      query = query.where('t.tenant_id', '=', tenantId);
    }

    const tags = await query
      .orderBy('t.name', 'asc')
      .execute();

    return tags as Tag[];
  } catch (error) {
    console.error('Error fetching bill tags:', error);
    return [];
  }
}

/**
 * Fetches tags for multiple bills in a single database query
 * More efficient than calling getBillTags() multiple times
 * @param billIds - Array of bill IDs
 * @returns Object mapping bill IDs to their tag arrays
 */
export async function getBatchBillTags(billIds: string[], tenantId?: string): Promise<Record<string, Tag[]>> {
  try {
    if (!Array.isArray(billIds) || billIds.length === 0) {
      return {};
    }

    // Fetch tags for all bills in a single query
    let query = db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        'bt.bill_id',
        't.id',
        't.name',
        't.color',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', 'in', billIds);

    if (tenantId) {
      query = query.where('t.tenant_id', '=', tenantId);
    }

    const billTags = await query
      .orderBy('t.name', 'asc')
      .execute();

    // Group tags by bill ID
    const tagsByBillId = billTags.reduce((acc, row) => {
      if (!acc[row.bill_id]) {
        acc[row.bill_id] = [];
      }
      acc[row.bill_id].push({
        id: row.id,
        name: row.name,
        color: row.color,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as Tag);
      return acc;
    }, {} as Record<string, Tag[]>);

    // Ensure all requested bill IDs have an entry (even if empty)
    billIds.forEach(billId => {
      if (!tagsByBillId[billId]) {
        tagsByBillId[billId] = [];
      }
    });

    return tagsByBillId;
  } catch (error) {
    console.error('Error fetching batch bill tags:', error);
    return {};
  }
}

/**
 * Updates tags for a specific bill
 * Replaces all existing tags with the new set
 * @param billId - Bill ID
 * @param tagIds - Array of tag IDs to associate with the bill
 * @returns Array of tags now associated with the bill
 * @throws Error if bill not found or tag IDs are invalid
 */
export async function updateBillTags(billId: string, tagIds: string[], tenantId?: string): Promise<Tag[]> {
  try {
    console.log('Updating bill tags for billId:', billId.slice(0, 6), '...');
    // Check if bill exists
    const bill = await db
      .selectFrom('bills')
      .select('id')
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      throw new Error('Bill not found');
    }

    // Remove existing tags for this bill, scoped to the caller's tenant
    if (tenantId) {
      await db
        .deleteFrom('bill_tags')
        .where('bill_id', '=', billId)
        .where('tag_id', 'in',
          db.selectFrom('tags').select('id').where('tenant_id', '=', tenantId)
        )
        .execute();
    } else {
      await db
        .deleteFrom('bill_tags')
        .where('bill_id', '=', billId)
        .where('tag_id', 'in',
          db.selectFrom('tags').select('id').where('tenant_id', 'is', null)
        )
        .execute();
    }

    // Add new tags if any provided
    if (tagIds.length > 0) {
      // Verify all tag IDs exist and belong to tenant
      let validTagsQuery = db
        .selectFrom('tags')
        .select('id')
        .where('id', 'in', tagIds);

      if (tenantId) {
        validTagsQuery = validTagsQuery.where('tenant_id', '=', tenantId);
      }

      const validTags = await validTagsQuery.execute();

      if (validTags.length !== tagIds.length) {
        throw new Error('One or more tag IDs are invalid');
      }

      // Insert new bill_tags associations
      await db
        .insertInto('bill_tags')
        .values(
          tagIds.map((tagId: string) => ({
            bill_id: billId,
            tag_id: tagId,
          }))
        )
        .execute();
    }

    // Fetch and return updated tags
    const updatedTags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .orderBy('t.name', 'asc')
      .execute();

    return updatedTags as Tag[];
  } catch (error) {
    console.error('Error updating bill tags:', error);
    throw error instanceof Error ? error : new Error('Failed to update bill tags');
  }
}
