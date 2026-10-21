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
export async function getAllTags(tenantId: string): Promise<Tag[]> {
  try {
    const tags = await db
      .selectFrom('tags')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('name', 'asc')
      .execute();

    return tags as Tag[];
  } catch (error: any) {
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
export async function createTag(name: string, color: string | undefined, tenantId: string): Promise<Tag> {
  try {
    console.log('Creating new tag:', name, 'for tenant:', tenantId.slice(0, 6), '...');
    const existingTag = await db
      .selectFrom('tags')
      .select('id')
      .where('name', '=', name.trim())
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (existingTag) {
      throw new Error('Tag with this name already exists');
    }

    const newTag = await db
      .insertInto('tags')
      .values({
        name: name.trim(),
        color: color || null,
        tenant_id: tenantId,
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
export async function updateTag(id: string, name: string, color: string | undefined, tenantId: string): Promise<Tag> {
  try {
    const existingTag = await db
      .selectFrom('tags')
      .select(['id', 'tenant_id'])
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!existingTag) {
      throw new Error('Tag not found');
    }

    const duplicateTag = await db
      .selectFrom('tags')
      .select('id')
      .where('name', '=', name.trim())
      .where('id', '!=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (duplicateTag) {
      throw new Error('Tag with this name already exists');
    }

    const updatedTag = await db
      .updateTable('tags')
      .set({
        name: name.trim(),
        color: color || null,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
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
export async function deleteTag(id: string, tenantId: string): Promise<void> {
  try {
    const existingTag = await db
      .selectFrom('tags')
      .select('id')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!existingTag) {
      throw new Error('Tag not found');
    }

    await db.deleteFrom('tags')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
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
export async function getBillTags(billId: string, tenantId: string): Promise<Tag[]> {
  try {
    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
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
export async function getBatchBillTags(billIds: string[], tenantId: string): Promise<Record<string, Tag[]>> {
  try {
    if (!Array.isArray(billIds) || billIds.length === 0) {
      return {};
    }

    const billTags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        'bt.bill_id',
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', 'in', billIds)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    const tagsByBillId = billTags.reduce((acc, row) => {
      if (!acc[row.bill_id]) {
        acc[row.bill_id] = [];
      }
      acc[row.bill_id].push({
        id: row.id,
        name: row.name,
        color: row.color,
        tenant_id: row.tenant_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as Tag);
      return acc;
    }, {} as Record<string, Tag[]>);

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
export async function updateBillTags(billId: string, tagIds: string[], tenantId: string): Promise<Tag[]> {
  try {
    console.log('Updating bill tags for billId:', billId.slice(0, 6), '...');
    const bill = await db
      .selectFrom('bills')
      .select('id')
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      throw new Error('Bill not found');
    }

    // Remove existing tags for this bill that belong to this tenant
    await db
      .deleteFrom('bill_tags')
      .where('bill_id', '=', billId)
      .where('tag_id', 'in',
        db.selectFrom('tags').select('id').where('tenant_id', '=', tenantId)
      )
      .execute();

    if (tagIds.length > 0) {
      const validTags = await db
        .selectFrom('tags')
        .select('id')
        .where('id', 'in', tagIds)
        .where('tenant_id', '=', tenantId)
        .execute();

      if (validTags.length !== tagIds.length) {
        throw new Error('One or more tag IDs are invalid');
      }

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

    const updatedTags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return updatedTags as Tag[];
  } catch (error) {
    console.error('Error updating bill tags:', error);
    throw error instanceof Error ? error : new Error('Failed to update bill tags');
  }
}
