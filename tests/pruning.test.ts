import { MemoryService } from '../src/services/memoryService';
import { FakeEmbeddingProvider, FakeMemoryRepository, FakeSessionRepository } from './fakes';

describe('pruning old memories', () => {
  const sessionId = 'prune-session';
  let memoryRepo: FakeMemoryRepository;
  let sessionRepo: FakeSessionRepository;
  let service: MemoryService;

  beforeEach(() => {
    memoryRepo = new FakeMemoryRepository();
    sessionRepo = new FakeSessionRepository();
    service = new MemoryService(memoryRepo, sessionRepo, new FakeEmbeddingProvider(0.1, false));
  });

  it('prunes stale, low-importance memories and keeps recent ones', async () => {
    // Low-importance, stale memory
    const oldMemory = await memoryRepo.create({
      sessionId,
      text: 'old log entry',
      compressedText: 'old log entry',
      importanceScore: 0.1
    });
    const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    memoryRepo.setTimestamps(oldMemory.id, ninetyFiveDaysAgo, sixtyDaysAgo);

    // Recent, important memory
    await memoryRepo.create({
      sessionId,
      text: 'recent purchase of a laptop for $2200',
      compressedText: 'recent purchase of a laptop',
      importanceScore: 0.8
    });

    const result = await service.pruneOldMemories({
      maxAgeDays: 90,
      inactiveDays: 30,
      importanceThreshold: 0.3
    });

    expect(result.pruned).toBe(1);
    expect(result.candidates).toBe(1);
  });
});
