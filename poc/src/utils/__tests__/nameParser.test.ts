import { describe, it, expect } from 'vitest';
import { NameParser } from '../nameParser.js';

describe('NameParser', () => {
  describe('parseFullName', () => {
    it('should parse simple first and last name', () => {
      expect(NameParser.parseFullName('John Doe')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
    
    it('should handle single name', () => {
      expect(NameParser.parseFullName('John')).toEqual({
        firstName: 'John',
        lastName: ''
      });
    });
    
    it('should handle empty string', () => {
      expect(NameParser.parseFullName('')).toEqual({
        firstName: '',
        lastName: ''
      });
    });
    
    it('should handle multiple spaces', () => {
      expect(NameParser.parseFullName('John   Doe')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
    
    it('should handle three-part names', () => {
      expect(NameParser.parseFullName('John Michael Doe')).toEqual({
        firstName: 'John',
        lastName: 'Michael Doe'
      });
    });
    
    it('should remove prefixes', () => {
      expect(NameParser.parseFullName('Dr. John Doe')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(NameParser.parseFullName('Mr. John Doe')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(NameParser.parseFullName('Prof. John Doe')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
    
    it('should remove suffixes', () => {
      expect(NameParser.parseFullName('John Doe Jr.')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(NameParser.parseFullName('John Doe PhD')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(NameParser.parseFullName('John Doe III')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
    
    it('should remove both prefixes and suffixes', () => {
      expect(NameParser.parseFullName('Dr. John Doe Jr.')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(NameParser.parseFullName('Mr. John Michael Doe PhD')).toEqual({
        firstName: 'John',
        lastName: 'Michael Doe'
      });
    });
    
    it('should handle only prefix', () => {
      expect(NameParser.parseFullName('Dr.')).toEqual({
        firstName: '',
        lastName: ''
      });
    });
    
    it('should handle only suffix', () => {
      expect(NameParser.parseFullName('Jr.')).toEqual({
        firstName: '',
        lastName: ''
      });
    });
    
    it('should handle case insensitive prefixes and suffixes', () => {
      expect(NameParser.parseFullName('DR. John Doe JR.')).toEqual({
        firstName: 'John',
        lastName: 'Doe'
      });
    });
  });
});
