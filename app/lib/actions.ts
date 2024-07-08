'use server';
import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};
 
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    // Below is server side form validation
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
  .number()
  .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

//* Note: FormData is the native object for forms... (see MDN)
export async function createInvoice(prevState: State, formData: FormData) {
    const validatedFields = CreateInvoice.safeParse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status'),
    });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  // Prepare data for insertion into the database
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

/**Now that you have all the values you need for your database (and validated through Zod), 
 * you can create an SQL query to insert the new invoice 
 * into your database and pass in the variables: */
  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch(error) { 
     // If a database error occurs, return a more specific error.
    return { message: 'Database Error: Failed to create invoice.'}
  }
    /**Next.js has a Client-side Router Cache that stores the route segments in the user's browser for a time. 
     * Along with prefetching, this cache ensures that users 
     * can quickly navigate between routes while reducing the number of requests made to the server.

    Since you're updating the data displayed in the invoices route, 
    you want to clear this cache and trigger a new request to the server. 
    You can do this with the revalidatePath function from Next.js: */
    revalidatePath('/dashboard/invoices');


    /**
     * Once the database has been updated, the /dashboard/invoices path will be revalidated, 
     * and fresh data will be fetched from the server.
     * At this point, you also want to redirect the user back 
     * to the /dashboard/invoices page. You can do this with the redirect function from Next.js:
     */
    redirect('/dashboard/invoices');
  }

  //* Update Invoice Action
  /**
   * Similarly to the createInvoice action, here you are:

    Extracting the data from formData.
    Validating the types with Zod.
    Converting the amount to cents.
    Passing the variables to your SQL query.
    Calling revalidatePath to clear the client cache and make a new server request.
    Calling redirect to redirect the user to the invoice's page.
   */

const UpdateInvoice = FormSchema.omit({ id: true, date: true });
 
export async function updateInvoice(id: string, formData: FormData) {
  const { customerId, amount, status } = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
 
  const amountInCents = amount * 100;
  
  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
  } catch(error) {
    return { message: 'Database Error: Failed to update invoice.'}
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

//* Delete Invoice Action
/**
 * 
 * Since this action is being called in the /dashboard/invoices path, 
 * you don't need to call redirect. 
 * Calling revalidatePath will trigger a new server request and re-render the table.
 */
export async function deleteInvoice(id: string) {
    // throw new Error('Failed to Delete Invoice');

    try { 
        await sql`DELETE FROM invoices WHERE id = ${id}`;
        revalidatePath('/dashboard/invoices');
        return { message: 'Deleted Invoice.' };
    } catch(error) {
        return { message: 'Database Error: Failed to delete invoice'}
    }
}