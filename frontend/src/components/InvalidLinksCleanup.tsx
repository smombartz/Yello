import { useState } from 'react';
import { useSearchInvalidLinks, useRemoveInvalidLinks } from '../api/invalidLinksHooks';
import type { InvalidLinkMatch } from '../api/types';

export function InvalidLinksCleanup() {
  const [inputValue, setInputValue] = useState('');
  const [searchedPatterns, setSearchedPatterns] = useState<string[]>([]);
  const [matches, setMatches] = useState<InvalidLinkMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const searchMutation = useSearchInvalidLinks();
  const removeMutation = useRemoveInvalidLinks();

  const handleSearch = () => {
    const patterns = inputValue
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (patterns.length === 0) return;

    setSearchedPatterns(patterns);
    searchMutation.mutate(patterns, {
      onSuccess: (data) => {
        setMatches(data.matches);
        setHasSearched(true);
      },
    });
  };

  const handleRemoveAll = () => {
    if (searchedPatterns.length === 0) return;

    removeMutation.mutate(searchedPatterns, {
      onSuccess: (data) => {
        setMatches([]);
        setHasSearched(false);
        setInputValue('');
        setSearchedPatterns([]);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !searchMutation.isPending) {
      handleSearch();
    }
  };

  // Group matches by contact
  const groupedMatches = matches.reduce((acc, match) => {
    if (!acc[match.contactId]) {
      acc[match.contactId] = {
        contactId: match.contactId,
        contactName: match.contactName,
        items: [],
      };
    }
    acc[match.contactId].items.push(match);
    return acc;
  }, {} as Record<number, { contactId: number; contactName: string; items: InvalidLinkMatch[] }>);

  const groupedList = Object.values(groupedMatches);

  return (
    <div className="invalid-links-cleanup">
      <div className="invalid-links-search">
        <div className="search-input-row">
          <input
            type="text"
            placeholder="Enter patterns separated by commas (e.g., pages, instagram, https, profile.php)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={searchMutation.isPending || removeMutation.isPending}
            className="patterns-input"
          />
          <button
            onClick={handleSearch}
            disabled={searchMutation.isPending || removeMutation.isPending || !inputValue.trim()}
            className="search-button"
          >
            {searchMutation.isPending ? (
              <>
                <span className="material-symbols-outlined spinning">sync</span>
                Searching...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">search</span>
                Search
              </>
            )}
          </button>
        </div>

        {hasSearched && (
          <div className="search-results-header">
            <span className="results-count">
              {matches.length} invalid link{matches.length !== 1 ? 's' : ''} found
              {matches.length > 0 && ` across ${groupedList.length} contact${groupedList.length !== 1 ? 's' : ''}`}
            </span>
            {matches.length > 0 && (
              <button
                onClick={handleRemoveAll}
                disabled={removeMutation.isPending}
                className="remove-all-button"
              >
                {removeMutation.isPending ? (
                  <>
                    <span className="material-symbols-outlined spinning">sync</span>
                    Removing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">delete</span>
                    Remove All ({matches.length})
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {hasSearched && matches.length === 0 && (
        <div className="no-matches">
          <span className="material-symbols-outlined">check_circle</span>
          <p>No invalid links found matching the patterns.</p>
        </div>
      )}

      {groupedList.length > 0 && (
        <div className="matches-list">
          {groupedList.map((group) => (
            <div key={group.contactId} className="match-group">
              <div className="match-contact-name">{group.contactName}</div>
              <div className="match-items">
                {group.items.map((item) => (
                  <div key={`${item.source}-${item.recordId}`} className="match-item">
                    <span className="match-source">
                      {item.source === 'social_profiles' ? (
                        <>
                          <span className="material-symbols-outlined">person</span>
                          {item.platform}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">link</span>
                          URL
                        </>
                      )}
                    </span>
                    <span className="match-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {removeMutation.isSuccess && (
        <div className="success-message">
          <span className="material-symbols-outlined">check_circle</span>
          Removed {removeMutation.data.deletedCount} invalid link{removeMutation.data.deletedCount !== 1 ? 's' : ''}.
        </div>
      )}
    </div>
  );
}
