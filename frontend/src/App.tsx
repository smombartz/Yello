import { useState } from 'react';
import { ContactList } from './components/ContactList';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  // selectedContactId will be used by ContactDetail panel (Task 4.4)
  const [_selectedContactId, setSelectedContactId] = useState<number | null>(null);

  return (
    <main className="container">
      <header>
        <nav>
          <ul>
            <li><strong>Contact Manager</strong></li>
          </ul>
          <ul>
            <li>
              <input
                type="search"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </li>
            <li>
              <button>Import VCF</button>
            </li>
          </ul>
        </nav>
      </header>

      <section>
        <ContactList
          search={searchQuery}
          onSelectContact={setSelectedContactId}
        />
      </section>
    </main>
  );
}

export default App;
