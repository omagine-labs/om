# Python Backend Scripts

Utility scripts for development and testing.

## Scripts

### `langfuse_game_dataset.py`

Manage Langfuse datasets for game analysis prompt testing.

**Full documentation**: See [docs/game-analysis.md](/docs/game-analysis.md)

**Quick reference**:
```bash
source venv/bin/activate

# Create dataset
python scripts/langfuse_game_dataset.py create --name "game-analysis-test"

# Add video
python scripts/langfuse_game_dataset.py add-production-video \
    --dataset "game-analysis-test" \
    --video-path "user-id/2026/01/game-xxx-video.webm"

# List items
python scripts/langfuse_game_dataset.py list --dataset "game-analysis-test"

# Run evaluation
python scripts/langfuse_game_dataset.py evaluate \
    --dataset "game-analysis-test" \
    --run-name "baseline"
```
