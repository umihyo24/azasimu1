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
  storageVisualCapacity: 20,
  fishPerCatch: 1,
  buildingPosition: Object.freeze({ x: 15, y: 16 }),
  sealStartPosition: Object.freeze({ x: 15, y: 18 }),
  assetSizeRatio: 0.78,
  foodStorageSize: Object.freeze({ width: 3.8, height: 2.4 }),
  floatingTextDuration: 1.15,
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

const EFFECTS = Object.freeze({
  floatingText: "floatingText",
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
  carryingValue: document.getElementById("carryingValue"),
  targetValue: document.getElementById("targetValue"),
  seaFishBar: document.getElementById("seaFishBar"),
  storageBar: document.getElementById("storageBar"),
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
    visualEffects: [],
    timing: {
      lastFrameTime: performance.now(),
      animationTime: 0,
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
    label: "Food Storage",
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
  state.visualEffects = freshState.visualEffects;
  state.timing = freshState.timing;
  state.message = freshState.message;
}

function gameLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - gameState.timing.lastFrameTime) / 1000, 0.1);
  gameState.timing.lastFrameTime = timestamp;
  gameState.timing.animationTime += deltaSeconds;

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
  updateVisualEffects(state, deltaSeconds);
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
  addFloatingTextEffect(state, "Nom", seal.position, "#fff1a8");
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

function updateVisualEffects(state, deltaSeconds) {
  state.visualEffects = state.visualEffects
    .map((effect) => ({ ...effect, age: effect.age + deltaSeconds }))
    .filter((effect) => effect.age < effect.duration);
}

function addFloatingTextEffect(state, text, position, color) {
  state.visualEffects.push({
    type: EFFECTS.floatingText,
    text,
    position: { x: position.x, y: position.y },
    color,
    age: 0,
    duration: CONFIG.floatingTextDuration,
  });
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
  state.seals.forEach((seal) => drawSeal(seal, state.timing.animationTime));
  drawVisualEffects(state.visualEffects);
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
  const rect = buildingRect(storage.position.x, storage.position.y, CONFIG.foodStorageSize.width, CONFIG.foodStorageSize.height);
  drawStorageBuilding(rect);
  drawTextLabel(storage.label, rect.x + rect.width / 2, rect.y + rect.height + 20, "#3a2410", "900 14px sans-serif");
  drawInventorySign(`${storage.inventory.fish} fish`, rect.x + rect.width / 2, rect.y - 13);
}

function drawStorageBuilding(rect) {
  context.save();
  context.fillStyle = "#8b5a2b";
  context.strokeStyle = "#3b220e";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(rect.x, rect.y + rect.height * 0.24, rect.width, rect.height * 0.76, 8);
  context.fill();
  context.stroke();

  context.fillStyle = "#c98134";
  context.beginPath();
  context.moveTo(rect.x - 8, rect.y + rect.height * 0.3);
  context.lineTo(rect.x + rect.width / 2, rect.y);
  context.lineTo(rect.x + rect.width + 8, rect.y + rect.height * 0.3);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#4a2b12";
  context.fillRect(rect.x + rect.width * 0.12, rect.y + rect.height * 0.46, rect.width * 0.23, rect.height * 0.3);
  context.fillRect(rect.x + rect.width * 0.65, rect.y + rect.height * 0.46, rect.width * 0.23, rect.height * 0.3);
  context.fillStyle = "#593318";
  context.fillRect(rect.x + rect.width * 0.42, rect.y + rect.height * 0.44, rect.width * 0.16, rect.height * 0.56);
  context.restore();
}

function drawSeal(seal, animationTime) {
  const rect = gridRect(seal.position.x, seal.position.y, CONFIG.assetSizeRatio);
  const moving = isSealMoving(seal);
  const bob = moving ? Math.sin(animationTime * 13) * 3 : Math.sin(animationTime * 3) * 1.2;
  const stretch = moving ? Math.sin(animationTime * 13) * 1.5 : 0;
  const animatedRect = {
    x: rect.x - stretch / 2,
    y: rect.y + bob,
    width: rect.size + stretch,
    height: rect.size - stretch,
  };

  drawSealBody(seal, animatedRect);
  drawTaskFeedback(seal, animatedRect, animationTime);
  drawHungerWarning(seal, animatedRect.x, animatedRect.y, animatedRect.width);
}

function drawSealBody(seal, rect) {
  if (ASSETS.seal.loaded && !ASSETS.seal.failed) {
    context.drawImage(ASSETS.seal.image, rect.x, rect.y, rect.width, rect.height);
  } else {
    drawSealPlaceholder(rect.x, rect.y, rect.width, rect.height);
  }

  if (seal.carryingItem) {
    drawCarriedFishStack(rect.x + rect.width * 0.5, rect.y - 10, seal.carryingItem.amount);
  }
}

function drawSealPlaceholder(x, y, width, height) {
  context.save();
  context.fillStyle = "#f7fbff";
  context.strokeStyle = "#2e6071";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(x + width * 0.5, y + height * 0.56, width * 0.48, height * 0.31, -0.12, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#d7eef8";
  context.beginPath();
  context.ellipse(x + width * 0.74, y + height * 0.42, width * 0.22, height * 0.2, 0.2, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#163947";
  context.beginPath();
  context.arc(x + width * 0.8, y + height * 0.37, 2.5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#8fb7c4";
  context.beginPath();
  context.moveTo(x + width * 0.13, y + height * 0.57);
  context.lineTo(x - width * 0.08, y + height * 0.42);
  context.lineTo(x - width * 0.03, y + height * 0.73);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawTaskFeedback(seal, rect, animationTime) {
  if (seal.currentTask === TASKS.fishing && !isSealMoving(seal)) {
    drawFishingParticles(rect.x + rect.width * 0.5, rect.y + rect.height * 0.22, animationTime);
  }

  if (seal.currentTask === TASKS.delivering && seal.carryingItem) {
    drawDeliveryBadge(rect.x + rect.width * 0.5, rect.y - 30);
  }
}

function drawFishingParticles(centerX, centerY, animationTime) {
  const icons = ["🐟", "•", "🐟"];

  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  icons.forEach((icon, index) => {
    const phase = animationTime * 4 + index * 1.8;
    const x = centerX + Math.cos(phase) * (18 + index * 4);
    const y = centerY - 18 + Math.sin(phase) * 8;
    context.globalAlpha = 0.55 + Math.sin(phase) * 0.25;
    context.fillStyle = index === 1 ? "#d9fbff" : "#9bedff";
    context.font = index === 1 ? "900 18px sans-serif" : "18px sans-serif";
    context.fillText(icon, x, y);
  });
  context.restore();
}

function drawDeliveryBadge(x, y) {
  context.save();
  context.fillStyle = "rgba(8, 32, 44, 0.9)";
  context.strokeStyle = "#9bedff";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x - 34, y - 14, 68, 28, 14);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "800 12px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Delivering", x, y + 1);
  context.restore();
}

function drawCarriedFishStack(centerX, y, amount) {
  const visibleFish = Math.max(1, Math.min(amount, 3));
  for (let index = 0; index < visibleFish; index += 1) {
    drawCarriedItem(centerX - 11 + index * 10, y - index * 2);
  }
}

function drawCarriedItem(x, y) {
  drawAssetOrPlaceholder(ASSETS.fish, x, y, 22, 22, "F");
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

function drawInventorySign(text, x, y) {
  context.save();
  context.fillStyle = "rgba(8, 32, 44, 0.92)";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x - 36, y - 14, 72, 28, 10);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "900 13px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y + 1);
  context.restore();
}

function drawTextLabel(text, x, y, color, font) {
  context.save();
  context.fillStyle = "rgba(255, 246, 221, 0.86)";
  context.strokeStyle = "rgba(59, 34, 14, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x - 48, y - 13, 96, 26, 8);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y + 1);
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

function drawVisualEffects(effects) {
  effects.forEach((effect) => {
    if (effect.type === EFFECTS.floatingText) {
      drawFloatingTextEffect(effect);
    }
  });
}

function drawFloatingTextEffect(effect) {
  const progress = effect.age / effect.duration;
  const x = effect.position.x * CONFIG.tileSize + CONFIG.tileSize / 2;
  const y = effect.position.y * CONFIG.tileSize - progress * 34;

  context.save();
  context.globalAlpha = 1 - progress;
  context.fillStyle = effect.color;
  context.strokeStyle = "#3b220e";
  context.lineWidth = 4;
  context.font = "900 20px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(effect.text, x, y);
  context.fillText(effect.text, x, y);
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
  const storageFish = state.buildings.foodStorage.inventory.fish;

  ui.phaseValue.textContent = state.phase;
  ui.seaFishValue.textContent = `${seaFish} / ${CONFIG.maxSeaFish}`;
  ui.storageValue.textContent = `${storageFish} fish`;
  ui.hungerValue.textContent = `${Math.floor(seal.hunger)} / ${CONFIG.maxHunger}`;
  ui.taskValue.textContent = seal.currentTask;
  ui.carryingValue.textContent = formatCarryingItem(seal.carryingItem);
  ui.targetValue.textContent = formatTargetDestination(seal.currentTask, seal.target);
  setProgressBar(ui.seaFishBar, seaFish, CONFIG.maxSeaFish);
  setProgressBar(ui.storageBar, storageFish, CONFIG.storageVisualCapacity);
  setProgressBar(ui.hungerBar, seal.hunger, CONFIG.maxHunger);
}

function setProgressBar(element, value, maxValue) {
  element.style.width = `${(clamp(value, 0, maxValue) / maxValue) * 100}%`;
}

function formatCarryingItem(carryingItem) {
  if (!carryingItem) {
    return "None";
  }

  return `${capitalize(carryingItem.type)} x${carryingItem.amount}`;
}

function formatTargetDestination(task, target) {
  if (!target) {
    return "None";
  }

  const destinationName = getDestinationName(task);
  return `${destinationName} (${target.x.toFixed(0)}, ${target.y.toFixed(0)})`;
}

function getDestinationName(task) {
  if (task === TASKS.fishing) {
    return "Sea fishing tile";
  }

  if (task === TASKS.delivering || task === TASKS.seekingFood) {
    return "Food Storage";
  }

  return "Current tile";
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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

function buildingRect(gridX, gridY, widthTiles, heightTiles) {
  return {
    x: (gridX - widthTiles / 2 + 0.5) * CONFIG.tileSize,
    y: (gridY - heightTiles / 2 + 0.5) * CONFIG.tileSize,
    width: widthTiles * CONFIG.tileSize,
    height: heightTiles * CONFIG.tileSize,
  };
}

function isSealMoving(seal) {
  return Boolean(seal.target) && !samePosition(seal.position, seal.target);
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
