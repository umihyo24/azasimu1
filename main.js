const CONFIG = Object.freeze({
  gridSize: 30,
  tileSize: 24,
  seaRows: 10,
  maxSeaFish: 100,
  initialSeaFish: 84,
  fishRegenPerSecond: 1.6,
  fishCatchCost: 5,
  minFishingEfficiency: 0.25,
  fishingWorkRequired: 2.2,
  sealMoveTilesPerSecond: 5,
  hungerPerSecond: 2.1,
  hungerEatThreshold: 58,
  hungerCriticalThreshold: 82,
  maxHunger: 100,
  hungerReducedPerFish: 42,
  storageStartingFish: 0,
  fishPerCatch: 1,
  buildingPosition: Object.freeze({ x: 15, y: 16 }),
  sealStartPosition: Object.freeze({ x: 15, y: 18 }),
  assetSizeRatio: 0.78,
});

const ASSETS = {
  seal: createImageAsset("Seal", "assets/seal.png", "#f7fbff", "#2e6071"),
  storage: createImageAsset("Food Storage", "assets/food-storage.png", "#c08a45", "#4d3218"),
  fish: createImageAsset("Fish", "assets/fish.png", "#73d7ff", "#004e70"),
};

const TASKS = Object.freeze({
  waiting: "Waiting",
  fishing: "Fishing",
  delivering: "Delivering fish",
  eating: "Eating",
  seekingFood: "Going to food storage",
  gameover: "Starving",
});

const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");
const ui = {
  startButton: document.getElementById("startButton"),
  phaseValue: document.getElementById("phaseValue"),
  seaFishValue: document.getElementById("seaFishValue"),
  storageValue: document.getElementById("storageValue"),
  hungerValue: document.getElementById("hungerValue"),
  taskValue: document.getElementById("taskValue"),
  hungerBar: document.getElementById("hungerBar"),
};

const gameState = createInitialGameState();

function createImageAsset(name, src, primaryColor, secondaryColor) {
  const asset = {
    name,
    src,
    image: new Image(),
    loaded: false,
    failed: false,
    primaryColor,
    secondaryColor,
  };

  asset.image.onload = () => {
    asset.loaded = true;
  };

  asset.image.onerror = () => {
    asset.failed = true;
  };

  asset.image.src = src;
  return asset;
}

function createInitialGameState() {
  return {
    phase: "start",
    map: createMap(),
    resources: {
      seaFish: CONFIG.initialSeaFish,
    },
    buildings: {
      foodStorage: createFoodStorage(CONFIG.buildingPosition.x, CONFIG.buildingPosition.y),
    },
    seals: [createSeal(CONFIG.sealStartPosition.x, CONFIG.sealStartPosition.y)],
    timing: {
      lastFrameTime: performance.now(),
    },
    message: "Press Start Colony to begin.",
  };
}

function createMap() {
  const tiles = [];

  for (let y = 0; y < CONFIG.gridSize; y += 1) {
    const row = [];
    for (let x = 0; x < CONFIG.gridSize; x += 1) {
      row.push(y < CONFIG.seaRows ? "sea" : "beach");
    }
    tiles.push(row);
  }

  return { width: CONFIG.gridSize, height: CONFIG.gridSize, tiles };
}

function createFoodStorage(x, y) {
  return {
    type: "foodStorage",
    position: { x, y },
    inventory: { fish: CONFIG.storageStartingFish },
  };
}

function createSeal(x, y) {
  return {
    position: { x, y },
    hunger: 0,
    carryingItem: null,
    currentTask: TASKS.waiting,
    target: null,
    actionProgress: 0,
  };
}

function startGame() {
  if (gameState.phase !== "start") {
    resetGameState(gameState);
  }

  gameState.phase = "playing";
  gameState.message = "The seal colony is active.";
  gameState.timing.lastFrameTime = performance.now();
  ui.startButton.textContent = "Restart Colony";
}

function resetGameState(state) {
  const freshState = createInitialGameState();
  state.phase = freshState.phase;
  state.map = freshState.map;
  state.resources = freshState.resources;
  state.buildings = freshState.buildings;
  state.seals = freshState.seals;
  state.timing = freshState.timing;
  state.message = freshState.message;
}

function gameLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - gameState.timing.lastFrameTime) / 1000, 0.1);
  gameState.timing.lastFrameTime = timestamp;

  update(gameState, deltaSeconds);
  render(gameState);

  requestAnimationFrame(gameLoop);
}

function update(state, deltaSeconds) {
  if (state.phase !== "playing") {
    return;
  }

  regenerateSeaFish(state, deltaSeconds);
  updateSeals(state, deltaSeconds);
  checkGameOver(state);
}

function regenerateSeaFish(state, deltaSeconds) {
  state.resources.seaFish = clamp(
    state.resources.seaFish + CONFIG.fishRegenPerSecond * deltaSeconds,
    0,
    CONFIG.maxSeaFish,
  );
}

function updateSeals(state, deltaSeconds) {
  state.seals.forEach((seal) => {
    increaseHunger(seal, deltaSeconds);
    assignSealTask(state, seal);
    performSealTask(state, seal, deltaSeconds);
  });
}

function increaseHunger(seal, deltaSeconds) {
  seal.hunger = clamp(seal.hunger + CONFIG.hungerPerSecond * deltaSeconds, 0, CONFIG.maxHunger);
}

function assignSealTask(state, seal) {
  const storage = state.buildings.foodStorage;

  if (isSealHungry(seal) && storage.inventory.fish > 0) {
    setSealTask(seal, TASKS.seekingFood, storage.position);
    return;
  }

  if (seal.carryingItem) {
    setSealTask(seal, TASKS.delivering, storage.position);
    return;
  }

  setSealTask(seal, TASKS.fishing, findBestFishingTile(state));
}

function performSealTask(state, seal, deltaSeconds) {
  if (moveSealTowardTarget(seal, deltaSeconds)) {
    seal.actionProgress = 0;
    return;
  }

  if (seal.currentTask === TASKS.seekingFood) {
    eatFromStorage(state, seal);
    return;
  }

  if (seal.currentTask === TASKS.delivering) {
    deliverCarriedFish(state, seal);
    return;
  }

  if (seal.currentTask === TASKS.fishing) {
    fishFromSea(state, seal, deltaSeconds);
  }
}

function isSealHungry(seal) {
  return seal.hunger >= CONFIG.hungerEatThreshold;
}

function setSealTask(seal, task, target) {
  if (seal.currentTask !== task || !samePosition(seal.target, target)) {
    seal.currentTask = task;
    seal.target = { x: target.x, y: target.y };
    seal.actionProgress = 0;
  }
}

function moveSealTowardTarget(seal, deltaSeconds) {
  if (!seal.target || samePosition(seal.position, seal.target)) {
    return false;
  }

  const moveBudget = CONFIG.sealMoveTilesPerSecond * deltaSeconds;
  seal.position = movePointToward(seal.position, seal.target, moveBudget);
  return !samePosition(seal.position, seal.target);
}

function movePointToward(position, target, distance) {
  const next = { x: position.x, y: position.y };
  let remaining = distance;

  remaining = moveAxisToward(next, target, "x", remaining);
  moveAxisToward(next, target, "y", remaining);

  return next;
}

function moveAxisToward(position, target, axis, distance) {
  const difference = target[axis] - position[axis];
  const step = Math.sign(difference) * Math.min(Math.abs(difference), distance);
  position[axis] += step;
  return distance - Math.abs(step);
}

function eatFromStorage(state, seal) {
  const storage = state.buildings.foodStorage;

  if (storage.inventory.fish <= 0) {
    seal.currentTask = TASKS.waiting;
    return;
  }

  storage.inventory.fish -= 1;
  seal.hunger = clamp(seal.hunger - CONFIG.hungerReducedPerFish, 0, CONFIG.maxHunger);
  seal.currentTask = TASKS.eating;
  seal.actionProgress = 0;
}

function deliverCarriedFish(state, seal) {
  if (!seal.carryingItem) {
    return;
  }

  const storage = state.buildings.foodStorage;
  storage.inventory.fish += seal.carryingItem.amount;
  seal.carryingItem = null;
  seal.currentTask = TASKS.waiting;
  seal.actionProgress = 0;
}

function fishFromSea(state, seal, deltaSeconds) {
  if (state.resources.seaFish < CONFIG.fishCatchCost * CONFIG.minFishingEfficiency) {
    seal.currentTask = TASKS.waiting;
    return;
  }

  seal.actionProgress += getFishingEfficiency(state) * deltaSeconds;

  if (seal.actionProgress >= CONFIG.fishingWorkRequired) {
    const fishCost = Math.min(CONFIG.fishCatchCost, state.resources.seaFish);
    state.resources.seaFish -= fishCost;
    seal.carryingItem = { type: "fish", amount: CONFIG.fishPerCatch };
    seal.actionProgress = 0;
    seal.currentTask = TASKS.delivering;
  }
}

function getFishingEfficiency(state) {
  const stockRatio = state.resources.seaFish / CONFIG.maxSeaFish;
  return clamp(stockRatio, CONFIG.minFishingEfficiency, 1);
}

function findBestFishingTile(state) {
  const x = clamp(Math.round(state.buildings.foodStorage.position.x), 0, state.map.width - 1);
  const y = Math.max(0, CONFIG.seaRows - 2);
  return { x, y };
}

function checkGameOver(state) {
  const starvingSeal = state.seals.find((seal) => seal.hunger >= CONFIG.maxHunger);

  if (!starvingSeal) {
    return;
  }

  state.phase = "gameover";
  starvingSeal.currentTask = TASKS.gameover;
  state.message = "Game over: the seal reached maximum hunger.";
  ui.startButton.textContent = "Restart Colony";
}

function render(state) {
  renderWorld(state);
  renderUi(state);
}

function renderWorld(state) {
  clearCanvas();
  drawMap(state.map);
  drawStorage(state.buildings.foodStorage);
  state.seals.forEach(drawSeal);
  drawOverlay(state);
}

function clearCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawMap(map) {
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      drawTile(x, y, map.tiles[y][x]);
    }
  }
}

function drawTile(x, y, type) {
  const colors = getTileColors(type);
  const px = x * CONFIG.tileSize;
  const py = y * CONFIG.tileSize;

  context.fillStyle = colors.base;
  context.fillRect(px, py, CONFIG.tileSize, CONFIG.tileSize);
  context.strokeStyle = colors.line;
  context.strokeRect(px, py, CONFIG.tileSize, CONFIG.tileSize);
}

function getTileColors(type) {
  if (type === "sea") {
    return { base: "#1a8fbd", line: "rgba(160, 230, 255, 0.16)" };
  }

  return { base: "#d4b071", line: "rgba(70, 45, 12, 0.15)" };
}

function drawStorage(storage) {
  const rect = gridRect(storage.position.x, storage.position.y, 1.8);
  drawAssetOrPlaceholder(ASSETS.storage, rect.x, rect.y, rect.size, rect.size, "S");
  drawInventoryBadge(storage.inventory.fish, rect.x + rect.size * 0.62, rect.y - 6);
}

function drawSeal(seal) {
  const rect = gridRect(seal.position.x, seal.position.y, CONFIG.assetSizeRatio);
  drawAssetOrPlaceholder(ASSETS.seal, rect.x, rect.y, rect.size, rect.size, "Seal");

  if (seal.carryingItem) {
    drawCarriedItem(rect.x + rect.size * 0.62, rect.y - rect.size * 0.2);
  }

  drawHungerWarning(seal, rect.x, rect.y, rect.size);
}

function drawAssetOrPlaceholder(asset, x, y, width, height, label) {
  if (asset.loaded && !asset.failed) {
    context.drawImage(asset.image, x, y, width, height);
    return;
  }

  drawVisiblePlaceholder(asset, x, y, width, height, label);
}

function drawVisiblePlaceholder(asset, x, y, width, height, label) {
  context.save();
  context.fillStyle = asset.primaryColor;
  context.strokeStyle = asset.secondaryColor;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(x, y, width, height, 8);
  context.fill();
  context.stroke();

  context.fillStyle = asset.secondaryColor;
  context.font = `${Math.max(10, Math.floor(width / 4))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + width / 2, y + height / 2, width - 4);
  context.restore();
}

function drawCarriedItem(x, y) {
  drawAssetOrPlaceholder(ASSETS.fish, x, y, 18, 18, "F");
}

function drawInventoryBadge(value, x, y) {
  context.save();
  context.fillStyle = "#08202c";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 13, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "700 12px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(value), x, y + 1);
  context.restore();
}

function drawHungerWarning(seal, x, y, size) {
  if (seal.hunger < CONFIG.hungerCriticalThreshold) {
    return;
  }

  context.save();
  context.fillStyle = "#ff6978";
  context.font = "900 16px sans-serif";
  context.textAlign = "center";
  context.fillText("!", x + size / 2, y - 5);
  context.restore();
}

function drawOverlay(state) {
  if (state.phase === "playing") {
    return;
  }

  context.save();
  context.fillStyle = "rgba(3, 12, 18, 0.62)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = "900 34px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(state.phase === "start" ? "Seal Colony Manager" : "Game Over", canvas.width / 2, canvas.height / 2 - 24);
  context.font = "700 16px sans-serif";
  context.fillText(state.message, canvas.width / 2, canvas.height / 2 + 20);
  context.restore();
}

function renderUi(state) {
  const seal = state.seals[0];
  const seaFish = Math.floor(state.resources.seaFish);

  ui.phaseValue.textContent = state.phase;
  ui.seaFishValue.textContent = `${seaFish} / ${CONFIG.maxSeaFish}`;
  ui.storageValue.textContent = String(state.buildings.foodStorage.inventory.fish);
  ui.hungerValue.textContent = `${Math.floor(seal.hunger)} / ${CONFIG.maxHunger}`;
  ui.taskValue.textContent = seal.currentTask;
  ui.hungerBar.style.width = `${(seal.hunger / CONFIG.maxHunger) * 100}%`;
}

function gridRect(gridX, gridY, tileRatio) {
  const size = CONFIG.tileSize * tileRatio;
  const offset = (CONFIG.tileSize - size) / 2;

  return {
    x: gridX * CONFIG.tileSize + offset,
    y: gridY * CONFIG.tileSize + offset,
    size,
  };
}

function samePosition(a, b) {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

ui.startButton.addEventListener("click", startGame);
render(gameState);
requestAnimationFrame(gameLoop);
