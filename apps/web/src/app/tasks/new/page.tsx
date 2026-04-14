import { redirect } from 'next/navigation';

// /tasks/new is now the landing page (/). Keep this route for backward-
// compatible deep links and bookmarks; it just forwards.
export default function NewTaskRedirect() {
  redirect('/');
}
