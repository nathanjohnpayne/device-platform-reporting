/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Papa from 'papaparse';
import UploadZone from '../UploadZone';

jest.mock('papaparse', () => ({
  parse: jest.fn(),
}));

function selectFile(container, file = new File(['csv'], 'sample.csv', { type: 'text/csv' })) {
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('UploadZone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows a validation error when expected columns are missing', async () => {
    Papa.parse.mockImplementation((_file, options) => {
      options.complete({
        data: [{ Foo: '1' }],
        meta: { fields: ['Foo'] },
      });
    });

    const onParsed = jest.fn();
    const { container } = render(
      <UploadZone
        label="Upload CSV"
        expectedColumns={['Foo', 'Bar']}
        onParsed={onParsed}
      />
    );

    selectFile(container);

    expect(await screen.findByText('Missing columns: Bar')).toBeTruthy();
    expect(onParsed).not.toHaveBeenCalled();
  });

  test('passes parsed rows, headers, and filename to onParsed on success', async () => {
    Papa.parse.mockImplementation((_file, options) => {
      options.complete({
        data: [{ Foo: '1' }],
        meta: { fields: ['Foo'] },
      });
    });

    const onParsed = jest.fn();
    const { container } = render(
      <UploadZone
        label="Upload CSV"
        expectedColumns={['Foo']}
        onParsed={onParsed}
      />
    );

    const file = selectFile(container, new File(['csv'], 'metrics.csv', { type: 'text/csv' }));

    expect(await screen.findByText('1 rows loaded')).toBeTruthy();
    expect(onParsed).toHaveBeenCalledWith([{ Foo: '1' }], ['Foo'], file.name);
    expect(screen.getByText('metrics.csv')).toBeTruthy();
  });

  test('surfaces a specific onParsed error instead of a generic parse failure', async () => {
    Papa.parse.mockImplementation((_file, options) => {
      options.complete({
        data: [{ Foo: '1' }],
        meta: { fields: ['Foo'] },
      });
    });

    const onParsed = jest.fn(() => {
      throw new Error('Custom schema validation failed');
    });
    const { container } = render(
      <UploadZone
        label="Upload CSV"
        expectedColumns={['Foo']}
        onParsed={onParsed}
      />
    );

    selectFile(container);

    expect(await screen.findByText('Custom schema validation failed')).toBeTruthy();
  });
});
