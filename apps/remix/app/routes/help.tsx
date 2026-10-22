import { Link } from 'react-router';
export default function Help() {
  return (
    <main className="capability-workspace" data-thread-none>
      <h1>e-sign help</h1>
      <p>Add a PDF, add your signers and place their fields.</p>
      <p>Send the document, then follow each recipient's progress.</p>
      <p>Workspace actions include hosted signing, identity checks and connected tools.</p>
      <p>
        Word uploads require a configured workspace key, accept files up to 100 MB and refuse password-protected files.
        Review the converted PDF before sending. Cloud certificate signing is unavailable.
      </p>
      <p>Your workspace owner controls accounts, privacy and document retention.</p>
      <Link to="/">Return to your workspace</Link>
    </main>
  );
}
