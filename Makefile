PNPM?=pnpm

.PHONY: install build dev clean pack

install:
	$(PNPM) install

build:
	$(PNPM) run build

dev:
	$(PNPM) run dev

clean:
	$(PNPM) run clean

pack: clean build
	@echo "Extension built in ./build. Load unpacked with manifest at project root."


